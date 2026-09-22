ALTER TABLE barber_profiles
    ADD COLUMN recommendations INTEGER NOT NULL DEFAULT 0
    CHECK (recommendations >= 0);

UPDATE barber_profiles
SET recommendations = CASE (
    SELECT display_name
    FROM users
    WHERE users.business_id = barber_profiles.business_id
      AND users.id = barber_profiles.user_id
)
    WHEN 'Bolacha' THEN 26
    WHEN 'Guilherme' THEN 0
    WHEN 'JAILSON' THEN 16
    WHEN 'Luizão' THEN 7
    WHEN 'Nailton' THEN 30
    WHEN 'Pedrinho' THEN 22
    WHEN 'Sorriso' THEN 29
    ELSE 0
END;
