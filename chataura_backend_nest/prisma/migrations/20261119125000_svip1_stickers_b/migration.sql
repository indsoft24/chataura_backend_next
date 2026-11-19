-- SVIP 1 wolf stickers, second set (free, SVIP 1 and higher). Safe to re-run: skips names that exist.
INSERT INTO "stickers" ("name", "coin_cost", "image_url", "is_active", "required_svip_level")
SELECT v.name, 0, v.url, true, 1
FROM (VALUES
  ('svip1-wolf-crown',     'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_05.webp'),
  ('svip1-wolf-cheers',    'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_06.webp'),
  ('svip1-wolf-thank-you', 'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_07.webp'),
  ('svip1-wolf-boss',      'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_08.webp')
) AS v(name, url)
WHERE NOT EXISTS (SELECT 1 FROM "stickers" s WHERE s."name" = v.name);
