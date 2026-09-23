-- Rewrite dead legacy gift CDN host to the live public host (same path under /storage/).
UPDATE "gifts"
SET "image_url" = replace("image_url", 'https://chataura.indsoft24.com', 'https://chataura.in')
WHERE "image_url" LIKE '%chataura.indsoft24.com%';

UPDATE "gifts"
SET "image_url" = replace("image_url", 'http://chataura.indsoft24.com', 'https://chataura.in')
WHERE "image_url" LIKE '%chataura.indsoft24.com%';

UPDATE "stickers"
SET "image_url" = replace("image_url", 'https://chataura.indsoft24.com', 'https://chataura.in')
WHERE "image_url" LIKE '%chataura.indsoft24.com%';

UPDATE "stickers"
SET "image_url" = replace("image_url", 'http://chataura.indsoft24.com', 'https://chataura.in')
WHERE "image_url" LIKE '%chataura.indsoft24.com%';

-- Promote static animation files to image_url when preview is missing.
UPDATE "gifts"
SET "image_url" = "animation_url"
WHERE ("image_url" IS NULL OR btrim("image_url") = '')
  AND "animation_url" IS NOT NULL
  AND "animation_url" ~* '\.(png|jpe?g|webp|gif)(\?|#|$)';

UPDATE "stickers"
SET "image_url" = "animation_url"
WHERE ("image_url" IS NULL OR btrim("image_url") = '')
  AND "animation_url" IS NOT NULL
  AND "animation_url" ~* '\.(png|jpe?g|webp|gif)(\?|#|$)';

-- Clear unusable Windows-path animation URLs.
UPDATE "gifts"
SET "animation_url" = NULL
WHERE "animation_url" ~* '^[a-zA-Z]:[\\/]'
   OR "animation_url" LIKE 'file:%';

UPDATE "stickers"
SET "animation_url" = NULL
WHERE "animation_url" ~* '^[a-zA-Z]:[\\/]'
   OR "animation_url" LIKE 'file:%';

-- Deactivate gifts with no usable HTTP image and no usable HTTP animation.
UPDATE "gifts"
SET "is_active" = false
WHERE "is_active" = true
  AND (
    "image_url" IS NULL
    OR btrim("image_url") = ''
    OR "image_url" !~* '^https?://'
  )
  AND (
    "animation_url" IS NULL
    OR btrim("animation_url") = ''
    OR "animation_url" !~* '^https?://'
  );
