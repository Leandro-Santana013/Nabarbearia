UPDATE barber_profiles
SET photo_url = REPLACE(photo_url, '/Pessoas/120x120/', '/Pessoas/original/'),
    updated_at_utc = updated_at_utc
WHERE photo_url LIKE '%/Pessoas/120x120/%';
