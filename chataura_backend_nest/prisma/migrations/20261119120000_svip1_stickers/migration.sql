-- SVIP 1 wolf stickers (free, SVIP 1 and higher). Images on GCS. Safe to re-run: skips names that exist.
INSERT INTO "stickers" ("name", "coin_cost", "image_url", "is_active", "required_svip_level")
SELECT v.name, 0, v.url, true, 1
FROM (VALUES
  ('svip1-wolf-hello', 'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_01.webp'),
  ('svip1-wolf-love',  'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_02.webp'),
  ('svip1-wolf-laugh', 'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_03.webp'),
  ('svip1-wolf-cool',  'https://storage.googleapis.com/chataura/svip/v1/svip1_sticker_04.webp')
) AS v(name, url)
WHERE NOT EXISTS (SELECT 1 FROM "stickers" s WHERE s."name" = v.name);
