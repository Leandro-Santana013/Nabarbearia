ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''
    CHECK (phone = '' OR (length(phone) BETWEEN 10 AND 13 AND phone NOT GLOB '*[^0-9]*'));
