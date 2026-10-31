-- SVIP 1 frame re-rendered with black disc removed (fully transparent background around ring & wings).
UPDATE "frames"
SET "image_url" = 'https://storage.googleapis.com/chataura/svip/v2/svip1_frame.png',
    "animation_url" = 'https://storage.googleapis.com/chataura/svip/v2/svip1_frame.webp'
WHERE "slug" = 'svip1_frame';

UPDATE "svip_level_configs"
SET "art" = jsonb_set("art", '{frame}', '"https://storage.googleapis.com/chataura/svip/v2/svip1_frame.webp"')
WHERE "level" = 1;
