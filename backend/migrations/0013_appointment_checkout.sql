-- Fechamento de atendimento pela gestão: serviços efetivamente realizados e
-- pagamento efetivamente recebido. Agendamentos existentes não são alterados:
-- atendimentos sem linhas continuam representados pelo serviço e pelo preço
-- gravados em appointments.

CREATE TABLE IF NOT EXISTS appointment_services (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    -- Nome e preço congelados no fechamento: o histórico não muda quando o catálogo muda.
    service_name TEXT NOT NULL CHECK (length(trim(service_name)) BETWEEN 1 AND 120),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 100000000),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 49),
    is_original INTEGER NOT NULL DEFAULT 0 CHECK (is_original IN (0, 1)),
    commission_rule_id TEXT,
    commission_cents INTEGER CHECK (commission_cents IS NULL OR commission_cents >= 0),
    created_by_user_id TEXT NOT NULL,
    created_at_utc TEXT NOT NULL,
    UNIQUE (business_id, id),
    UNIQUE (business_id, appointment_id, service_id),
    UNIQUE (business_id, appointment_id, position),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, service_id)
        REFERENCES services (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, commission_rule_id)
        REFERENCES commission_rules (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, created_by_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment
    ON appointment_services (business_id, appointment_id, position);

-- Pagamento efetivamente realizado. Não substitui appointments.payment_method,
-- que continua sendo apenas a forma de pagamento prevista no agendamento.
ALTER TABLE appointments ADD COLUMN paid_payment_method TEXT
    CHECK (paid_payment_method IS NULL OR paid_payment_method IN ('pix', 'cash', 'debit_card', 'credit_card'));
ALTER TABLE appointments ADD COLUMN paid_at_utc TEXT;
ALTER TABLE appointments ADD COLUMN paid_by_user_id TEXT;
