-- SVIP 2 snow leopard stickers (free, SVIP 2 and higher). Images on GCS. Safe to re-run: skips names that exist.
INSERT INTO "stickers" ("name", "coin_cost", "image_url", "is_active", "required_svip_level")
SELECT v.name, 0, v.url, true, 2
FROM (VALUES
  ('svip2-leopard-hello', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_01.webp'),
  ('svip2-leopard-love', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_02.webp'),
  ('svip2-leopard-laugh', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_03.webp'),
  ('svip2-leopard-cool', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_04.webp'),
  ('svip2-leopard-crown', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_05.webp'),
  ('svip2-leopard-cheers', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_06.webp'),
  ('svip2-leopard-thank-you', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_07.webp'),
  ('svip2-leopard-boss', 'https://storage.googleapis.com/chataura/svip/v1/svip2_sticker_08.webp')
) AS v(name, url)
WHERE NOT EXISTS (SELECT 1 FROM "stickers" s WHERE s."name" = v.name);
