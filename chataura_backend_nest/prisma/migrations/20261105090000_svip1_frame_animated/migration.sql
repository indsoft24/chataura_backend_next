-- SVIP 1 frame: animated WebP with the PNG as its still / low-power poster, both on GCS (immutable v1 path),
-- so every environment (production, staging) serves the same absolute URLs.
-- The client plays it as media_type animated_image and uses the PNG for seats past the motion budget.
UPDATE "frames"
SET "image_url" = 'https://storage.googleapis.com/chataura/svip/v1/svip1_frame.png',
    "animation_url" = 'https://storage.googleapis.com/chataura/svip/v1/svip1_frame.webp'
WHERE "slug" = 'svip1_frame';
