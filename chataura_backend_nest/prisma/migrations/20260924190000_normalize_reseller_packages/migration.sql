-- Align legacy seller package audience with wallet filter key.
UPDATE "CoinPackage"
SET "audience" = 'coin_seller'
WHERE LOWER("audience") IN ('reseller', 'seller', 'authorized_seller');
