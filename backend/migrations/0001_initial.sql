-- Initial schema for the NA Barbearia operational API.
-- Every business-scoped reference includes business_id. The composite foreign
-- keys prevent an application mistake from joining people, services or agendas
-- from different businesses.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bootstrap_completed_at_utc TEXT
);

CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
    timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 3 AND 64),
    currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    email TEXT NOT NULL COLLATE NOCASE CHECK (length(email) BETWEEN 3 AND 254),
    password_hash TEXT NOT NULL CHECK (length(password_hash) BETWEEN 32 AND 512),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 120),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    UNIQUE (business_id, id),
    UNIQUE (business_id, email)
);

CREATE TABLE IF NOT EXISTS user_roles (
    business_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('client', 'barber', 'owner')),
    created_at_utc TEXT NOT NULL,
    PRIMARY KEY (business_id, user_id, role),
    FOREIGN KEY (business_id, user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS barber_profiles (
    business_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    PRIMARY KEY (business_id, user_id),
    FOREIGN KEY (business_id, user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 100000000),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    UNIQUE (business_id, id)
);

CREATE TABLE IF NOT EXISTS weekly_schedules (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    barber_user_id TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at_utc TEXT NOT NULL,
    CHECK (end_minute > start_minute),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, barber_user_id)
        REFERENCES barber_profiles (business_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_weekly_schedules_barber_day
    ON weekly_schedules (business_id, barber_user_id, weekday, start_minute, end_minute);

CREATE TABLE IF NOT EXISTS availability_blocks (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    barber_user_id TEXT NOT NULL,
    starts_at_utc TEXT NOT NULL,
    ends_at_utc TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_by_user_id TEXT,
    created_at_utc TEXT NOT NULL,
    CHECK (ends_at_utc > starts_at_utc),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, barber_user_id)
        REFERENCES barber_profiles (business_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, created_by_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_blocks_barber_time
    ON availability_blocks (business_id, barber_user_id, starts_at_utc, ends_at_utc);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    client_user_id TEXT NOT NULL,
    barber_user_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    starts_at_utc TEXT NOT NULL,
    ends_at_utc TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'completed', 'no_show', 'cancelled')),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 100000000),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720),
    source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'owner', 'import')),
    cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 500),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by_user_id TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    cancelled_at_utc TEXT,
    completed_at_utc TEXT,
    CHECK (ends_at_utc > starts_at_utc),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, client_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, barber_user_id)
        REFERENCES barber_profiles (business_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, service_id)
        REFERENCES services (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, created_by_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_appointments_barber_time
    ON appointments (business_id, barber_user_id, starts_at_utc, ends_at_utc);
CREATE INDEX IF NOT EXISTS idx_appointments_client_time
    ON appointments (business_id, client_user_id, starts_at_utc);
CREATE INDEX IF NOT EXISTS idx_appointments_status
    ON appointments (business_id, status, starts_at_utc);

CREATE TABLE IF NOT EXISTS appointment_history (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    actor_user_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'rescheduled', 'completed', 'no_show', 'cancelled')),
    from_status TEXT,
    to_status TEXT,
    from_starts_at_utc TEXT,
    to_starts_at_utc TEXT,
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
    payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
    created_at_utc TEXT NOT NULL,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, actor_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_appointment_history_appointment
    ON appointment_history (business_id, appointment_id, created_at_utc);

CREATE TABLE IF NOT EXISTS commission_rules (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    barber_user_id TEXT,
    service_id TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('percent', 'fixed')),
    amount INTEGER NOT NULL CHECK (amount >= 0 AND amount <= 100000000),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN -1000 AND 1000),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    valid_from_utc TEXT,
    valid_until_utc TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    CHECK ((rule_type <> 'percent') OR amount <= 10000),
    CHECK (valid_until_utc IS NULL OR valid_from_utc IS NULL OR valid_until_utc > valid_from_utc),
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, barber_user_id)
        REFERENCES barber_profiles (business_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, service_id)
        REFERENCES services (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_lookup
    ON commission_rules (business_id, active, barber_user_id, service_id, priority);

CREATE TABLE IF NOT EXISTS service_executions (
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    started_at_utc TEXT NOT NULL,
    completed_at_utc TEXT,
    notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
    completed_by_user_id TEXT,
    PRIMARY KEY (business_id, appointment_id),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, completed_by_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS commission_snapshots (
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    barber_user_id TEXT NOT NULL,
    rule_id TEXT,
    rule_type TEXT,
    rule_amount INTEGER,
    base_cents INTEGER NOT NULL CHECK (base_cents >= 0),
    amount_cents INTEGER,
    status TEXT NOT NULL CHECK (status IN ('posted', 'pending_configuration', 'error')),
    error_code TEXT,
    created_at_utc TEXT NOT NULL,
    PRIMARY KEY (business_id, appointment_id),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, barber_user_id)
        REFERENCES barber_profiles (business_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, rule_id)
        REFERENCES commission_rules (business_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS financial_entries (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('revenue', 'commission')),
    amount_cents INTEGER,
    status TEXT NOT NULL CHECK (status IN ('posted', 'pending_configuration', 'error')),
    created_at_utc TEXT NOT NULL,
    UNIQUE (business_id, appointment_id, kind),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    CHECK ((status = 'posted' AND amount_cents IS NOT NULL AND amount_cents >= 0)
        OR (status <> 'posted'))
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_report
    ON financial_entries (business_id, kind, status, created_at_utc);

CREATE TABLE IF NOT EXISTS ratings (
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    client_user_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
    created_at_utc TEXT NOT NULL,
    PRIMARY KEY (business_id, appointment_id),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, client_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS consents (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    consent_type TEXT NOT NULL CHECK (length(consent_type) BETWEEN 2 AND 80),
    policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 80),
    granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
    source TEXT NOT NULL CHECK (length(source) BETWEEN 2 AND 80),
    created_at_utc TEXT NOT NULL,
    FOREIGN KEY (business_id, user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_consents_user
    ON consents (business_id, user_id, consent_type, created_at_utc);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
    business_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    csrf_hash TEXT NOT NULL CHECK (length(csrf_hash) = 64),
    created_at_utc TEXT NOT NULL,
    expires_at_utc TEXT NOT NULL,
    revoked_at_utc TEXT,
    rotated_to_hash TEXT,
    FOREIGN KEY (business_id, user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry
    ON sessions (business_id, user_id, expires_at_utc);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry
    ON sessions (expires_at_utc);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    business_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 160),
    idem_key TEXT NOT NULL CHECK (length(idem_key) BETWEEN 16 AND 128),
    request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
    response_json TEXT NOT NULL CHECK (json_valid(response_json)),
    response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 299),
    appointment_id TEXT,
    created_at_utc TEXT NOT NULL,
    PRIMARY KEY (business_id, user_id, endpoint, idem_key),
    FOREIGN KEY (business_id, user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    actor_user_id TEXT,
    action TEXT NOT NULL CHECK (length(action) BETWEEN 2 AND 120),
    entity_type TEXT NOT NULL CHECK (length(entity_type) BETWEEN 2 AND 80),
    entity_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    created_at_utc TEXT NOT NULL,
    FOREIGN KEY (business_id, actor_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS notification_outbox (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    appointment_id TEXT,
    event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 2 AND 100),
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'push')),
    status TEXT NOT NULL DEFAULT 'disabled' CHECK (status = 'disabled'),
    payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts = 0),
    external_id TEXT,
    next_attempt_at_utc TEXT,
    sent_at_utc TEXT,
    locked_at_utc TEXT,
    last_error TEXT,
    created_at_utc TEXT NOT NULL,
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT
);
