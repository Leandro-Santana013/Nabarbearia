ALTER TABLE barber_profiles
    ADD COLUMN photo_url TEXT CHECK (photo_url IS NULL OR length(photo_url) <= 1000);
