import { readFileSync } from 'node:fs';

const menu = JSON.parse(readFileSync(new URL('../public/menu.json', import.meta.url), 'utf8'));

const pickupSchedule = {
  intervalMinutes: 15,
  minimumNoticeMinutes: 20,
  bookingHorizonHours: 36,
  openingHour: 8,
  closingHour: 20,
  indiaOffsetMinutes: 330,
};
const millisecondsPerMinute = 60_000;

const orderLimits = {
  bodyLength: 10_000,
  nameLength: 60,
  noteLength: 250,
  bagLines: 30,
  quantityPerLine: 12,
};
const milkOptions = ['Regular milk', 'Oat milk'];
const standardOptions = ['Standard'];
const oatMilkSurcharge = 30;

const kitchenStatuses = ['Received', 'Preparing', 'Ready', 'Collected'];
const uuidPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const pickupCodeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const pickupCodeLength = 8;
const orderLookupPrefix = '/api/order/';

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(message, status = 400) {
  throw Object.assign(Error(message), { status });
}

function availablePickupTimes(now = Date.now()) {
  const interval = pickupSchedule.intervalMinutes * millisecondsPerMinute;
  const earliestPickup = now + pickupSchedule.minimumNoticeMinutes * millisecondsPerMinute;
  const firstSlot = Math.ceil(earliestPickup / interval) * interval;
  const lastSlot = now + pickupSchedule.bookingHorizonHours * 60 * millisecondsPerMinute;
  const times = [];

  for (let slot = firstSlot; slot <= lastSlot; slot += interval) {
    const localTime = new Date(slot + pickupSchedule.indiaOffsetMinutes * millisecondsPerMinute);
    const localHour = localTime.getUTCHours();
    if (localHour >= pickupSchedule.openingHour && localHour < pickupSchedule.closingHour) {
      times.push(slot);
    }
  }
  return times;
}

async function readRequestBody(request) {
  const text = await request.text();
  if (text.length > orderLimits.bodyLength) fail('Order too large.');

  try {
    return JSON.parse(text) || {};
  } catch {
    fail('Invalid request.');
  }
}

async function getOrCreatePickupCode(db, orderRef) {
  async function findCode() {
    const result = await db.query('SELECT code FROM pickup_codes WHERE ref=$1', [orderRef]);
    return result.rows[0];
  }

  let row = await findCode();
  while (!row) {
    const bytes = crypto.getRandomValues(new Uint8Array(pickupCodeLength));
    const code = Array.from(bytes, (byte) => pickupCodeAlphabet[byte % pickupCodeAlphabet.length]).join('');
    await db.query(
      'INSERT INTO pickup_codes(ref,code) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [orderRef, code],
    );
    row = await findCode();
  }
  return row.code;
}

function priceOrderLine(item) {
  const menuItem = menu.find((entry) => entry.id === item?.id);
  if (
    !menuItem || !Number.isInteger(item.qty)
    || item.qty < 1 || item.qty > orderLimits.quantityPerLine
  ) {
    fail('Check your quantities.');
  }

  const allowedOptions = menuItem.milkOptions ? milkOptions : standardOptions;
  if (!allowedOptions.includes(item.option)) fail('Choose an available option.');

  return {
    id: menuItem.id,
    name: menuItem.name,
    qty: item.qty,
    option: item.option,
    price: menuItem.price + (item.option === 'Oat milk' ? oatMilkSurcharge : 0),
  };
}

async function createOrder(db, request) {
  const { requestId, name, note = '', items, pickup } = await readRequestBody(request);
  if (
    !uuidPattern.test(requestId) || typeof name !== 'string' || !name.trim()
    || name.length > orderLimits.nameLength || typeof note !== 'string'
    || note.length > orderLimits.noteLength
  ) {
    fail('Enter a pickup name and check your order.');
  }
  if (!Array.isArray(items) || !items.length || items.length > orderLimits.bagLines) {
    fail('Your bag is empty or too large.');
  }

  const pickupName = name.trim();
  const kitchenNote = note.trim();
  const lines = items.map(priceOrderLine);
  const serializedLines = JSON.stringify(lines);

  async function findOrderByRequestId() {
    const result = await db.query('SELECT * FROM orders WHERE request_id=$1', [requestId]);
    return result.rows[0];
  }

  async function sendReceipt(row) {
    if (
      row.lines !== serializedLines || row.name !== pickupName
      || row.note !== kitchenNote || row.pickup !== pickup
    ) {
      fail('Start a new checkout.', 409);
    }
    return jsonResponse({ ref: row.ref, code: await getOrCreatePickupCode(db, row.ref) }, 201);
  }

  // Check an existing request before validating whether its pickup slot is still available.
  const existingOrder = await findOrderByRequestId();
  if (existingOrder) return sendReceipt(existingOrder);
  if (!availablePickupTimes().includes(pickup)) {
    fail('That pickup time has passed. Choose another slot.', 409);
  }

  await db.query(
    'INSERT INTO orders(ref,request_id,created,pickup,name,lines,amount,note) '
      + 'VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(request_id) DO NOTHING',
    [
      crypto.randomUUID(),
      requestId,
      Date.now(),
      pickup,
      pickupName,
      serializedLines,
      lines.reduce((total, line) => total + line.qty * line.price, 0),
      kitchenNote,
    ],
  );
  return sendReceipt(await findOrderByRequestId());
}

function orderRecord(row) {
  return {
    ref: row.ref,
    created: row.created,
    pickup: row.pickup,
    name: row.name,
    lines: JSON.parse(row.lines),
    amount: row.amount,
    note: row.note,
    status: row.status,
  };
}

async function lookupOrderRef(db, lookup) {
  if (uuidPattern.test(lookup)) return lookup;

  const code = lookup.toUpperCase().replace(/-/g, '');
  if (code.length !== pickupCodeLength || [...code].some((character) => !pickupCodeAlphabet.includes(character))) {
    fail('Check the pickup code on your receipt.', 400);
  }

  const { rows: [match] } = await db.query('SELECT ref FROM pickup_codes WHERE code=$1', [code]);
  if (!match) fail('No order found. Check the code and try again.', 404);
  return match.ref;
}

async function handleTrackedOrder(db, lookup, method) {
  const orderRef = await lookupOrderRef(db, lookup);

  if (method === 'POST') {
    const result = await db.query(
      "UPDATE orders SET status='Cancelled' WHERE ref=$1 AND status='Received'",
      [orderRef],
    );
    if (!result.rowCount) fail('The kitchen has already updated this order.', 409);
  }

  const { rows: [row] } = await db.query('SELECT * FROM orders WHERE ref=$1', [orderRef]);
  if (!row) fail('Order not found.', 404);
  return jsonResponse({ ...orderRecord(row), code: await getOrCreatePickupCode(db, orderRef) });
}

async function listKitchenOrders(db) {
  const { rows } = await db.query(
    "SELECT * FROM orders WHERE status IN ('Received','Preparing','Ready') ORDER BY pickup,created",
  );
  return jsonResponse(rows.map(orderRecord));
}

async function advanceKitchenOrder(db, request) {
  const { ref, from } = await readRequestBody(request);
  const statusIndex = kitchenStatuses.indexOf(from);
  const nextStatus = kitchenStatuses[statusIndex + 1];
  if (statusIndex < 0 || !nextStatus || !uuidPattern.test(ref)) fail('Invalid update.');

  const result = await db.query(
    'UPDATE orders SET status=$1 WHERE ref=$2 AND status=$3',
    [nextStatus, ref, from],
  );
  if (!result.rowCount) fail('Order changed. Refresh the queue.', 409);
  return jsonResponse({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;
    const db = env.DB;

    try {
      if (pathname === '/kitchen' || pathname.startsWith('/api/staff')) {
        if (!env.KITCHEN_PASSWORD) {
          return new Response('Set KITCHEN_PASSWORD to enable the staff kitchen.', { status: 503 });
        }
        const expectedAuthorization = 'Basic ' + btoa('staff:' + env.KITCHEN_PASSWORD);
        if (request.headers.get('Authorization') !== expectedAuthorization) {
          return new Response('Staff sign-in required.', {
            status: 401,
            headers: {
              'WWW-Authenticate': 'Basic realm="Cafe kitchen"',
              'Cache-Control': 'no-store',
            },
          });
        }
      }

      const origin = request.headers.get('Origin');
      if (pathname.startsWith('/api/') && method === 'POST' && origin && origin !== url.origin) {
        fail('Use the café website.', 403);
      }

      if (pathname === '/api/slots') return jsonResponse(availablePickupTimes());
      if (pathname === '/api/orders' && method === 'POST') return await createOrder(db, request);
      if (pathname.startsWith(orderLookupPrefix)) {
        return await handleTrackedOrder(db, pathname.slice(orderLookupPrefix.length), method);
      }
      if (pathname === '/api/staff' && method === 'GET') return await listKitchenOrders(db);
      if (pathname === '/api/staff' && method === 'POST') return await advanceKitchenOrder(db, request);

      if (pathname.startsWith('/api/')) fail('Page unavailable.', 404);
      return new Response('Page unavailable', { status: 404 });
    } catch (error) {
      if (!error.status) console.error(error.message);
      const message = error.status ? error.message : 'Unable to connect. Please try again.';
      return jsonResponse({ message }, error.status || 500);
    }
  },
};
