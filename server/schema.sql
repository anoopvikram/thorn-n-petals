-- Pickup orders and their current kitchen status.
CREATE TABLE IF NOT EXISTS orders (
  ref UUID PRIMARY KEY,
  request_id UUID UNIQUE NOT NULL,
  created BIGINT NOT NULL,
  pickup BIGINT NOT NULL,
  name TEXT NOT NULL,
  lines TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received'
);

CREATE INDEX IF NOT EXISTS queue_index ON orders(status, pickup);

-- Customer-facing lookup codes for orders.
CREATE TABLE IF NOT EXISTS pickup_codes (
  ref UUID PRIMARY KEY REFERENCES orders(ref),
  code TEXT UNIQUE NOT NULL
);
