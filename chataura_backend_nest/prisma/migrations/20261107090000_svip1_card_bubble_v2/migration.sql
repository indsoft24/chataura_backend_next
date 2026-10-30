-- SVIP 1 room card + bubble re-touched (cyan eye smear and empty plaque removed; bubble corner rebuilt with the real medal). New GCS folder: paths are immutable.
UPDATE "svip_level_configs"
SET "art" = "art" || jsonb_build_object(
  'room_card', 'https://storage.googleapis.com/chataura/svip/v2/svip1_room_card.webp',
  'bubble',    'https://storage.googleapis.com/chataura/svip/v2/svip1_bubble.webp'
)
WHERE "level" = 1;
