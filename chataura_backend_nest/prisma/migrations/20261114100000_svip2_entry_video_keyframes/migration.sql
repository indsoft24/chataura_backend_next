-- SVIP 2 entrance videos re-encoded with a keyframe every second (My Items takes its thumbnail from the nearest keyframe;
-- the first version had one keyframe, at a black frame 0). New GCS folder: paths are immutable.
UPDATE "entry_bars"
SET "animation_url" = 'https://storage.googleapis.com/chataura/entry-bars/svip/v3/svip2_' || substring("slug" from 6) || '.mp4'
WHERE "slug" IN ('svip2_winged_leopard', 'svip2_armored_leopard');
