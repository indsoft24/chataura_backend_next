-- SVIP Level 1 movable animated gifts (transparent animated WebP; flies from the gift button to the seat).
-- The files must already be in the bucket: gifts/v1/svip/svip1_gift_<file>_thumb.png and _animated.webp.
INSERT INTO "gifts" ("gift_key", "name", "coin_cost", "category", "image_url", "animation_url", "required_svip_level", "is_active")
SELECT v.k, v.n, v.c, 'svip',
       'https://storage.googleapis.com/chataura/gifts/v1/svip/svip1_gift_' || v.f || '_thumb.png',
       'https://storage.googleapis.com/chataura/gifts/v1/svip/svip1_gift_' || v.f || '_animated.webp',
       1, true
FROM (VALUES
    ('svip.love', 'Love', 600, 'love'),
    ('svip.super_card', 'Super Card', 1500, 'super_card'),
    ('svip.gold_rose', 'Gold rose', 30000, 'gold_rose'),
    ('svip.heart_gem', 'Heart Gem', 150000, 'heart_gem'),
    ('svip.rose_bouquet', 'Rose Bouquet', 240000, 'rose_bouquet'),
    ('svip.diamond_ring', 'Diamond Ring', 350000, 'diamond_ring'),
    ('svip.crown_of_glory', 'Crown of Glory', 500000, 'crown_glory'),
    ('svip.silver_wolf', 'Silver Wolf', 500000, 'silver_wolf'),
    ('svip.golden_swan', 'Golden Swan', 750000, 'golden_swan'),
    ('svip.celestial_moon', 'Celestial Moon', 1000000, 'celestial_moon'),
    ('svip.royal_chariot', 'Royal Chariot', 1500000, 'royal_chariot'),
    ('svip.crystal_castle', 'Crystal Castle', 2000000, 'crystal_castle'),
    ('svip.celestial_mount', 'Celestial Mount', 2500000, 'celestial_mount'),
    ('svip.wolf_sovereign_crest', 'Wolf Sovereign Crest', 3500000, 'wolf_sovereign'),
    ('svip.svip_star_medal', 'SVIP Star Medal', 5000000, 'svip_star_medal')
) AS v(k, n, c, f)
WHERE NOT EXISTS (SELECT 1 FROM "gifts" g WHERE g."gift_key" = v.k);
