import express from 'express';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import api from './api.js';

const buildDirectory = fileURLToPath(new URL('../dist', import.meta.url));
const appHtml = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const schemaUrl = new URL('./schema.sql', import.meta.url);

if (!process.env.DATABASE_URL) throw Error('Set DATABASE_URL in .env before starting.');

// Millisecond timestamps in this application are within JavaScript’s safe integer range.
pg.types.setTypeParser(20, Number);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const schema = await readFile(schemaUrl, 'utf8');
await db.query(schema);

const app = express();

app.get('/kitchen', (request, response, next) => {
  const password = process.env.KITCHEN_PASSWORD;
  if (!password) {
    return response.status(503).send('Set KITCHEN_PASSWORD to enable the kitchen.');
  }

  const expectedAuthorization = 'Basic ' + Buffer.from('staff:' + password).toString('base64');
  if (request.get('Authorization') !== expectedAuthorization) {
    return response
      .set('WWW-Authenticate', 'Basic realm="Cafe kitchen"')
      .status(401)
      .send('Staff sign-in required.');
  }
  next();
});

app.use('/api', express.text({ type: '*/*', limit: '10kb' }), async (request, response) => {
  const origin = process.env.PUBLIC_ORIGIN || request.protocol + '://' + request.get('host');
  const apiRequest = new Request(new URL(request.originalUrl, origin), {
    method: request.method,
    headers: request.headers,
    ...(request.method === 'POST' ? { body: request.body || '' } : {}),
  });
  const apiResponse = await api.fetch(apiRequest, {
    DB: db,
    KITCHEN_PASSWORD: process.env.KITCHEN_PASSWORD,
  });

  response
    .status(apiResponse.status)
    .set(Object.fromEntries(apiResponse.headers))
    .send(await apiResponse.text());
});

app.use(express.static(buildDirectory));
app.get(['/track', '/kitchen'], (_, response) => response.sendFile(appHtml));

const portFlagIndex = process.argv.indexOf('--port');
const commandLinePort = portFlagIndex >= 0 ? process.argv[portFlagIndex + 1] : 5000;
const port = Number(process.env.PORT || commandLinePort);

app.listen(port, '0.0.0.0', () => console.log('Café ready on port ' + port));
