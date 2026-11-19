-- Fixes 20261114100000, which built the URLs with a doubled underscore.
UPDATE "entry_bars" SET "animation_url" = 'https://storage.googleapis.com/chataura/entry-bars/svip/v3/svip2_winged_leopard.mp4' WHERE "slug" = 'svip2_winged_leopard';
UPDATE "entry_bars" SET "animation_url" = 'https://storage.googleapis.com/chataura/entry-bars/svip/v3/svip2_armored_leopard.mp4' WHERE "slug" = 'svip2_armored_leopard';
