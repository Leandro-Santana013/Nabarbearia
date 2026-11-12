ALTER TABLE availability_blocks ADD COLUMN block_type TEXT NOT NULL DEFAULT 'other';

CREATE TABLE IF NOT EXISTS recurring_availability_blocks (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    barber_user_id TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
    block_type TEXT NOT NULL DEFAULT 'day_off',
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_by_user_id TEXT NOT NULL,
    created_at_utc TEXT NOT NULL,
    CHECK (end_minute > start_minute),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, barber_user_id) REFERENCES barber_profiles (business_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, created_by_user_id) REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_recurring_blocks_barber_day
    ON recurring_availability_blocks (business_id, barber_user_id, weekday, start_minute, end_minute);

ALTER TABLE appointments ADD COLUMN cancellation_source TEXT;
ALTER TABLE appointments ADD COLUMN cancellation_notice_ack_at_utc TEXT;
CREATE INDEX IF NOT EXISTS idx_appointments_client_notice
    ON appointments (business_id, client_user_id, status, cancellation_source, starts_at_utc);
