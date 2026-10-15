ALTER TABLE appointments ADD COLUMN client_phone TEXT;
ALTER TABLE appointments ADD COLUMN payment_method TEXT CHECK(payment_method IS NULL OR payment_method IN ('Pix', 'Cartão', 'Presencial'));
ALTER TABLE appointments ADD COLUMN client_note TEXT;
