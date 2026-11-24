-- Correção administrativa de atendimentos concluídos. O histórico é somente de
-- inclusão: o próprio banco recusa alterações e exclusões.

CREATE TABLE IF NOT EXISTS appointment_corrections (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 500),
    previous_total_cents INTEGER NOT NULL CHECK (previous_total_cents >= 0),
    new_total_cents INTEGER NOT NULL CHECK (new_total_cents >= 0),
    previous_payment_method TEXT,
    new_payment_method TEXT NOT NULL CHECK (new_payment_method IN ('pix', 'cash', 'debit_card', 'credit_card')),
    -- Linhas completas antes e depois, serviços adicionados/removidos e preços alterados.
    previous_services_json TEXT NOT NULL CHECK (json_valid(previous_services_json)),
    new_services_json TEXT NOT NULL CHECK (json_valid(new_services_json)),
    added_services_json TEXT NOT NULL CHECK (json_valid(added_services_json)),
    removed_services_json TEXT NOT NULL CHECK (json_valid(removed_services_json)),
    previous_commission_cents INTEGER,
    new_commission_cents INTEGER,
    -- recalculated: comissão ainda não paga, atualizada; adjustment: já paga, ajuste lançado;
    -- pending: aguardando regra de comissão; unchanged: sem diferença.
    commission_treatment TEXT NOT NULL CHECK (commission_treatment IN ('recalculated', 'adjustment', 'pending', 'unchanged')),
    created_at_utc TEXT NOT NULL,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, actor_user_id)
        REFERENCES users (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_appointment_corrections_appointment
    ON appointment_corrections (business_id, appointment_id, created_at_utc);

CREATE TRIGGER IF NOT EXISTS appointment_corrections_no_update
BEFORE UPDATE ON appointment_corrections
BEGIN
    SELECT RAISE(ABORT, 'appointment corrections are append-only');
END;

CREATE TRIGGER IF NOT EXISTS appointment_corrections_no_delete
BEFORE DELETE ON appointment_corrections
BEGIN
    SELECT RAISE(ABORT, 'appointment corrections are append-only');
END;

-- Diferença de comissão de atendimento cujo valor já foi repassado. O registro
-- pago não muda; o ajuste (positivo ou negativo) entra no próximo repasse.
CREATE TABLE IF NOT EXISTS commission_adjustments (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 20 AND 64),
    business_id TEXT NOT NULL,
    appointment_id TEXT NOT NULL,
    barber_user_id TEXT NOT NULL,
    correction_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0 AND amount_cents BETWEEN -100000000 AND 100000000),
    payout_id TEXT,
    created_at_utc TEXT NOT NULL,
    UNIQUE (business_id, id),
    FOREIGN KEY (business_id, appointment_id)
        REFERENCES appointments (business_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, barber_user_id)
        REFERENCES barber_profiles (business_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (business_id, correction_id)
        REFERENCES appointment_corrections (business_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (business_id, payout_id)
        REFERENCES commission_payouts (business_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_commission_adjustments_open
    ON commission_adjustments (business_id, barber_user_id, payout_id);

-- Só é permitido vincular um ajuste em aberto a um repasse; nada mais muda.
CREATE TRIGGER IF NOT EXISTS commission_adjustments_only_settle
BEFORE UPDATE ON commission_adjustments
WHEN OLD.payout_id IS NOT NULL OR NEW.payout_id IS NULL
  OR NEW.amount_cents IS NOT OLD.amount_cents OR NEW.appointment_id IS NOT OLD.appointment_id
  OR NEW.barber_user_id IS NOT OLD.barber_user_id OR NEW.correction_id IS NOT OLD.correction_id
  OR NEW.business_id IS NOT OLD.business_id OR NEW.id IS NOT OLD.id
BEGIN
    SELECT RAISE(ABORT, 'commission adjustments can only be settled once');
END;

CREATE TRIGGER IF NOT EXISTS commission_adjustments_no_delete
BEFORE DELETE ON commission_adjustments
BEGIN
    SELECT RAISE(ABORT, 'commission adjustments are append-only');
END;
