UPDATE barber_profiles
SET photo_url = CASE
    WHEN photo_url LIKE '%/p_foto_000638145.jpg%'
        THEN 'https://www.trinks.com/imagens?path=Pessoas/original/p_foto_000638145.jpg?v=20251208164800'
    WHEN photo_url LIKE '%/p_foto_000412300.jpg%'
        THEN 'https://www.trinks.com/imagens?path=Pessoas/original/p_foto_000412300.jpg?v=20231009183300'
    WHEN photo_url LIKE '%/p_foto_000533829.jpg%'
        THEN 'https://www.trinks.com/imagens?path=Pessoas/original/p_foto_000533829.jpg?v=20251201222100'
    ELSE photo_url
END,
    updated_at_utc = updated_at_utc
WHERE photo_url LIKE '%/p_foto_000638145.jpg%'
   OR photo_url LIKE '%/p_foto_000412300.jpg%'
   OR photo_url LIKE '%/p_foto_000533829.jpg%';
