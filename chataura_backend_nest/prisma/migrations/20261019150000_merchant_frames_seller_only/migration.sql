-- Migration: 20261019150000_merchant_frames_seller_only
-- Purpose: The 4 Merchant frames (IDs 293-296) belong only to merchants (offline recharge sellers, role = 'seller').
--          As role frames keyed 'coin_seller', every seller owns all 4 automatically, nobody else can wear
--          or buy them, and the 10-minute sweep drops them from anyone who loses the seller role.

UPDATE frames
SET category = 'role',
    animation_key = 'coin_seller',
    coin_cost = 0,
    is_active = true
WHERE id IN (293, 294, 295, 296);

-- Unlock rows never grant role frames; remove stale ones so they do not linger as "owned" data.
DELETE FROM user_unlocked_frames WHERE frame_id IN (293, 294, 295, 296);
