ALTER TABLE services
    ADD COLUMN category TEXT NOT NULL DEFAULT 'Serviços'
    CHECK (length(trim(category)) BETWEEN 2 AND 80);
