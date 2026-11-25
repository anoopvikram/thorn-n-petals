import React, { useEffect, useState } from 'react';
import {
  formatPickupTime,
  formatPrice,
  readSavedValue,
  requestApi,
  saveValue,
} from './shared';

const trackingRefreshIntervalMs = 20_000;
const kitchenRefreshIntervalMs = 15_000;
const finalOrderStatuses = ['Collected', 'Cancelled'];
const kitchenNextStatusLabels = {
  Received: 'preparing',
  Preparing: 'ready',
  Ready: 'collected',
};

function normalizeOrderLookup(value) {
  return value.length === 36
    ? value.toLowerCase()
    : value.replace(/[\s-]/g, '').toUpperCase();
}

function formatPickupCode(code) {
  return code.slice(0, 4) + '-' + code.slice(4);
}

function OrderTicket({ order }) {
  return (
    <article className="ticket">
      <span className="status">{order.status}</span>
      <h3>{order.name}’s pickup</h3>
      <p><strong>{formatPickupTime(order.pickup)} IST</strong></p>
      {order.lines.map((line, index) => (
        <div key={index}>
          {line.qty} × {line.name}{line.option !== 'Standard' && ' · ' + line.option}
        </div>
      ))}
      <p><b>{formatPrice(order.amount)}</b> · Pay at counter</p>
      {order.note && <p>Kitchen note · {order.note}</p>}
    </article>
  );
}

function RecentOrders() {
  const orderRefs = readSavedValue('history', []);
  const pickupCodes = readSavedValue('codes', {});
  if (!orderRefs.length) return null;

  return (
    <>
      <h3>Recent orders on this device</h3>
      {orderRefs.map((orderRef, index) => {
        const code = pickupCodes[orderRef];
        const fallbackLabel = index === 0 ? 'Most recent order' : 'Earlier order';
        return (
          <p key={orderRef}>
            <a href={'/track?ref=' + encodeURIComponent(orderRef)}>
              {code ? 'Pickup ' + formatPickupCode(code) : fallbackLabel}
            </a>
          </p>
        );
      })}
    </>
  );
}

export function Track() {
  const lookupFromUrl = new URLSearchParams(location.search).get('ref')?.trim() || '';
  const lookupKey = normalizeOrderLookup(lookupFromUrl);
  const orderPath = 'order/' + encodeURIComponent(lookupKey);

  const [order, setOrder] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [lookupInput, setLookupInput] = useState(lookupFromUrl);

  useEffect(() => {
    if (!lookupKey) return;
    let isTrackingActive = true;
    let refreshTimer;

    async function refreshOrder() {
      try {
        const latestOrder = await requestApi(orderPath);
        if (!isTrackingActive) return;

        setOrder(latestOrder);
        setErrorMessage('');
        const savedCodes = readSavedValue('codes', {});
        saveValue('codes', { ...savedCodes, [latestOrder.ref]: latestOrder.code });

        if (!refreshTimer) setLookupInput(formatPickupCode(latestOrder.code));
        if (!finalOrderStatuses.includes(latestOrder.status)) {
          refreshTimer = setTimeout(refreshOrder, trackingRefreshIntervalMs);
        }
      } catch (error) {
        if (isTrackingActive) setErrorMessage(error.message);
      }
    }

    refreshOrder();
    return () => {
      isTrackingActive = false;
      clearTimeout(refreshTimer);
    };
  }, [lookupKey, orderPath]);

  async function cancelOrder() {
    if (!confirm('Cancel this pickup order?')) return;

    try {
      setOrder(await requestApi(orderPath, {}));
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  return (
    <section className="page area">
      <p className="eyebrow">Pickup counter</p>
      <h1>Track your order.</h1>
      <form className="lookup">
        <input
          name="ref"
          value={lookupInput}
          onChange={(event) => setLookupInput(event.target.value)}
          placeholder="Pickup code, e.g. K7MP-9QTX"
          aria-label="Pickup code"
          required
        />
        <button className="btn">Find order</button>
      </form>

      <div id="receipt" aria-live="polite">
        {errorMessage && <p role="alert">{errorMessage}</p>}
        {order && (
          <>
            <OrderTicket order={order} />
            <p>Pickup code <strong>{formatPickupCode(order.code)}</strong></p>
            {order.status === 'Received' && (
              <button className="outline" id="cancel" onClick={cancelOrder}>
                Cancel order
              </button>
            )}
          </>
        )}
      </div>

      <RecentOrders />
    </section>
  );
}

export function Kitchen() {
  const [orders, setOrders] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [updatingOrderRef, setUpdatingOrderRef] = useState('');

  async function refreshQueue() {
    try {
      setOrders(await requestApi('staff'));
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  useEffect(() => {
    refreshQueue();
    const refreshTimer = setInterval(() => {
      if (!document.hidden) refreshQueue();
    }, kitchenRefreshIntervalMs);
    return () => clearInterval(refreshTimer);
  }, []);

  async function advanceOrder(order) {
    setUpdatingOrderRef(order.ref);
    try {
      await requestApi('staff', { ref: order.ref, from: order.status });
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      await refreshQueue();
      setUpdatingOrderRef('');
    }
  }

  return (
    <section className="page area">
      <p className="eyebrow">Staff only</p>
      <h1>The kitchen queue.</h1>
      <div aria-live="polite">
        {errorMessage && <p role="alert">{errorMessage}</p>}
        {!orders && 'Loading orders…'}
        {orders?.length === 0 && <p>No active pickup orders. New orders will appear here.</p>}
        {orders?.map((order) => (
          <React.Fragment key={order.ref}>
            <OrderTicket order={order} />
            <button
              className="outline"
              disabled={updatingOrderRef === order.ref}
              onClick={() => advanceOrder(order)}
            >
              Mark {kitchenNextStatusLabels[order.status]}
            </button>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}
