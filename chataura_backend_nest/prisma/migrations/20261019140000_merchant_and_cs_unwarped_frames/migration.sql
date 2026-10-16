-- Migration: 20261019140000_merchant_and_cs_unwarped_frames
-- Purpose: Remaster 4 C.S frames (IDs 280, 290, 291, 292) with unwarped wide-aperture assets (v4)
--          Seed 4 new Merchant frames (IDs 293, 294, 295, 296) maintaining exact 58% hole

-- 1. Update C.S Frames (zero-warp, pristine 58% hole)
UPDATE frames SET 
  image_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/support_frame_official.png?v=4',
  animation_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/support_frame_official.webp?v=4',
  avatar_scale = 0.58
WHERE id = 280;

UPDATE frames SET 
  image_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_royal_gold.png?v=4',
  animation_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_royal_gold.webp?v=4',
  avatar_scale = 0.58
WHERE id = 290;

UPDATE frames SET 
  image_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_neon_audio.png?v=4',
  animation_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_neon_audio.webp?v=4',
  avatar_scale = 0.58
WHERE id = 291;

UPDATE frames SET 
  image_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_divine_angel.png?v=4',
  animation_url = 'https://storage.googleapis.com/chataura/avatar-frames/support/cs_frame_divine_angel.webp?v=4',
  avatar_scale = 0.58
WHERE id = 292;

-- 2. Seed 4 Merchant ("Marchant") Frames
INSERT INTO frames (id, name, slug, category, level_required, is_premium, is_active, avatar_scale, composite_mode, image_url, animation_url)
VALUES
  (293, 'Merchant Sovereign Gold', 'merchant_frame_gold', 'special', 1, true, true, 0.58, 'alpha', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_gold.png?v=1', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_gold.webp?v=1'),
  (294, 'Merchant Amethyst Tycoon', 'merchant_frame_royal', 'special', 1, true, true, 0.58, 'alpha', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_royal.png?v=1', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_royal.webp?v=1'),
  (295, 'Merchant Emerald Commerce', 'merchant_frame_emerald', 'special', 1, true, true, 0.58, 'alpha', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_emerald.png?v=1', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_emerald.webp?v=1'),
  (296, 'Merchant Diamond Treasury', 'merchant_frame_sapphire', 'special', 1, true, true, 0.58, 'alpha', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_sapphire.png?v=1', 
   'https://storage.googleapis.com/chataura/avatar-frames/merchant/merchant_frame_sapphire.webp?v=1')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  category = EXCLUDED.category,
  avatar_scale = EXCLUDED.avatar_scale,
  image_url = EXCLUDED.image_url,
  animation_url = EXCLUDED.animation_url,
  is_active = true;

SELECT setval('frames_id_seq', (SELECT MAX(id) FROM frames));
