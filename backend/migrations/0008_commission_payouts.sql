CREATE TABLE commission_payouts (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  barber_user_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  idempotency_key TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  UNIQUE(business_id,id),
  UNIQUE(business_id,idempotency_key),
  FOREIGN KEY(business_id,barber_user_id) REFERENCES barber_profiles(business_id,user_id),
  FOREIGN KEY(business_id,created_by_user_id) REFERENCES users(business_id,id)
);
CREATE TABLE commission_payout_items (
  business_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  payout_id TEXT NOT NULL,
  PRIMARY KEY(business_id,appointment_id),
  FOREIGN KEY(business_id,appointment_id) REFERENCES commission_snapshots(business_id,appointment_id),
  FOREIGN KEY(business_id,payout_id) REFERENCES commission_payouts(business_id,id)
);
