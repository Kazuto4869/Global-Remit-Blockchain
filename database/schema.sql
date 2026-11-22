CREATE TABLE IF NOT EXISTS users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'ADMIN')),
  stellar_public_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  full_name text NOT NULL,
  country text NOT NULL,
  demo_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason text,
  reviewed_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS kyc_user_latest ON kyc_submissions (user_id, id DESC);

CREATE TABLE IF NOT EXISTS aml_watchlist (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demo_id text NOT NULL UNIQUE,
  reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS aml_checks (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  asset_code text NOT NULL CHECK (asset_code IN ('VNDDEMO', 'USDDEMO')),
  amount numeric(20, 7) NOT NULL CHECK (amount > 0),
  result text NOT NULL CHECK (result IN ('PASS', 'FAIL')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aml_user_accepted ON aml_checks (user_id, created_at)
  WHERE result = 'PASS';

-- Các kết quả Phase 2 đã có là kiểm tra mô phỏng.
ALTER TABLE aml_checks ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS transfers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_user_id integer NOT NULL REFERENCES users(id),
  recipient_public_key text NOT NULL,
  type text NOT NULL CHECK (type IN ('DIRECT', 'PATH')),
  send_asset text NOT NULL,
  send_amount numeric(20, 7) NOT NULL CHECK (send_amount > 0),
  dest_asset text NOT NULL,
  received_amount numeric(20, 7),
  status text NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'BLOCKED_KYC', 'BLOCKED_AML')),
  tx_hash text UNIQUE,
  fee_xlm numeric(20, 7),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  confirmed_at timestamptz,
  request_key uuid,
  envelope_xdr text,
  UNIQUE (sender_user_id, request_key)
);

CREATE INDEX IF NOT EXISTS transfers_sender_recent ON transfers (sender_user_id, created_at)
  WHERE status IN ('PENDING', 'CONFIRMED');

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS dest_min numeric(20, 7) CHECK (dest_min > 0);
