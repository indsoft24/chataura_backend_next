# Public files: GCS -> Cloudflare R2 (cdn.chataura.in)

Why: GCS charges for every download (about Rs 3,200 in one month). R2 has no download fee.
All 1,390 files (1.06 GiB) were copied 1:1 on 2026-11-28 with the same paths, so only the host in front of the path changes.

- R2 bucket: `ca-assets-fab3f76b211d` (Asia-Pacific, Standard, public access OFF). Served only through the custom domain `cdn.chataura.in`.
- Old bucket: GCS `chataura`, private. Keep it ~2 months as a backup, then delete.
- Code switch is OFF until `ASSET_PUBLIC_BASE` is set. Branches: backend `feature/r2-assets`, app `feature/cdn-base`.

## Cut-over order (each step is safe on its own)

1. Cloudflare: R2 -> bucket -> Settings -> Custom Domains -> add `cdn.chataura.in` (delete the old `cdn` DNS record first if asked).
   Check: `curl -I https://cdn.chataura.in/svip/v1/svip1_frame.webp` -> 200 and `cf-cache-status`.
2. Cloudflare: Cache rule for `cdn.chataura.in` (Edge TTL 1 month, respect origin) and a rate-limit rule (see below).
3. R2 token for the backend (Object Read & Write, this bucket only, no expiry) -> `scripts/set-r2-secrets.sh` writes it on the server.
4. Staging: set `ASSET_PUBLIC_BASE=https://cdn.chataura.in` and the `R2_*` values in the staging env, redeploy, run
   `node scripts/rewrite-asset-urls.js` (dry run) then `--apply` against the staging DB. Team checks art, frames, gifts, medals, an admin art upload.
5. Production (only after the team says go): back up the DB, set the same env, redeploy, `--apply`. Rollback: `--revert`, unset `ASSET_PUBLIC_BASE`.
6. App 1.7.4 ships `CdnUrls` (bundled / cached / hard-coded links). Old apps keep working for everything the server sends; their hard-coded
   rocket / CP effects stop until they update, so raise `app_min_version_code` once 1.7.4 is live.
7. After 2 weeks of clean running: remove the GCS key from the server and delete the old bucket.

## Rate limit (Cloudflare -> Security -> WAF -> Rate limiting rules)
Match: hostname = cdn.chataura.in. Count per IP, 300 requests / 10 s -> Block 10 min. Phones on one mobile network share IPs, so keep it generous.

## Costs to watch
R2 free tier: 10 GB stored, 1 M writes, 10 M reads per month, downloads free. Budget alert in Cloudflare (Billing -> Notifications).
