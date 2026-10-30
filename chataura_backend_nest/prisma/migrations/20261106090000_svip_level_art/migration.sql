-- Per-level SVIP Center art served from GCS (app keeps a small bundled still as fallback).
-- Keys: medal, frame, room_card, bubble. Convention: svip/v1/svip<level>_<key>.webp (see docs/SVIP_LEVEL_ART_GCS.md).
ALTER TABLE "svip_level_configs" ADD COLUMN "art" JSONB;

UPDATE "svip_level_configs"
SET "art" = jsonb_build_object(
  'medal',     'https://storage.googleapis.com/chataura/svip/v1/svip1_medal.webp',
  'frame',     'https://storage.googleapis.com/chataura/svip/v1/svip1_frame.webp',
  'room_card', 'https://storage.googleapis.com/chataura/svip/v1/svip1_room_card.webp',
  'bubble',    'https://storage.googleapis.com/chataura/svip/v1/svip1_bubble.webp'
)
WHERE "level" = 1;
