# SERVER CURSOR AGENT PROMPT — ChatAura Gift Media → GCS + `gifts` table

Copy everything below the line into a Cursor agent chat on the **VPS Nest backend** (`chataura_backend_next` / `chataura_backend_nest`).

---

## Mission

A zip pack of gift thumbs + WebM motion will be drag-dropped onto this server (do **not** `git pull` assets — that conflicts with local VPS files).

Your job:

1. Unzip the pack.
2. Upload every image + animation from `MANIFEST.json` to Google Cloud Storage under `gifts/v1/…`.
3. Upsert each row in the **`gifts`** table (`image_url`, `animation_url`, `coin_cost`, `category`, `is_active`) so `GET /gift-types` serves the **same gift names** the Android app already shows, with durable GCS HTTPS URLs.
4. Re-run catalog ensure helpers so CP/BCP relationship rules stay linked and future `ensure*` calls do **not** rewrite URLs back to Nest `/uploads/`.
5. Write `/tmp/gift_gcs_urls.json` and reply with the deliverable JSON.

Do **not** change Android. Do **not** delete the zip or extracted files after upload. Do **not** touch `app_fx_assets` / `fx/v1` (already migrated). Prefer reusing existing GCS helpers (`gcs.storage.ts` / `uploadPublicFile`).

---

## Input pack

- Zip name (expected): `chataura_gifts_gcs_v1.zip`
- After extract, root folder is typically `gifts_gcs_migrate/` containing:
  - `MANIFEST.json` (source of truth)
  - folders: `cp/`, `flags/`, `lucky/`, `bcp/`
  - optional `SERVER_AGENT_PROMPT.md`
- Suggested extract path: `/tmp/chataura_gifts_gcs_v1/` (or keep the `gifts_gcs_migrate` folder name — pass that dir to import).

`MANIFEST.json.gifts[]` fields:

| Field | Meaning |
|--------|---------|
| `gift_key` | Stable key (e.g. `lucky_clover`, `flag_in`) |
| `name` | Exact gift display name (DB + Android fallback key) |
| `category` | `standard` \| `lucky` \| `bcp` \| `cp` |
| `coin_cost` | Integer |
| `image_file` | Relative path in pack |
| `animation_file` | Relative path in pack |
| `gcs_image_object` | Full GCS object key |
| `gcs_animation_object` | Full GCS object key |

Expected counts: **95 gifts** × 2 media = **190 files** (30 flags + 12 lucky + 12 BCP + 41 CP).

---

## GCS layout

Bucket: `process.env.GCS_BUCKET` (production: `chataura`).

```text
gifts/v1/cp/cp_gift_{key}.png
gifts/v1/cp/cp_fx_{key}.webm
gifts/v1/flags/flag_gift_{iso}.png
gifts/v1/flags/flag_fx_{iso}.webm
gifts/v1/lucky/lucky_gift_{key}.png
gifts/v1/lucky/lucky_fx_{key}.webm
gifts/v1/bcp/bcp_gift_{key}.png
gifts/v1/bcp/bcp_fx_{key}.webm
```

Public URL:

```text
https://storage.googleapis.com/{GCS_BUCKET}/gifts/v1/...
```

Content-Type: `image/png` / `video/webm`. Cache-Control same as FX import (`public, max-age=31536000, immutable`). Idempotent overwrite OK.

---

## Database

Table: **`gifts`** (Prisma `Gift`).

Upsert by **`(name, category)`**:

- Set `image_url` = GCS image URL
- Set `animation_url` = GCS webm URL
- Set `coin_cost`, `is_active=true`, `category`
- Create if missing

Then ensure relationship rules:

- CP gifts → `relationshipGiftRule` for type `cp`
- BCP gifts → `relationshipGiftRule` for type `bcp`

If the Nest code on this VPS already has `GiftsGcsService` / `npm run gifts:import`, use that. If not, either:

- Pull/cherry-pick only the **code** commit that adds `gifts-cdn.ts`, catalog URL switch, and `gifts:import` (still **do not** pull conflicting asset binaries), or
- Implement the same import loop with `uploadPublicFile` + Prisma.

**Catalog URL base (critical):** set env (or rely on defaults):

```bash
# Prefer explicit:
GIFTS_PUBLIC_BASE=https://storage.googleapis.com/chataura/gifts/v1
# Or ensure GCS_BUCKET=chataura so resolveGiftsCdnBase() builds the same URL.
```

After import, `ensureCpAffectionGiftCatalog` / `ensureExtraGiftCatalogs` must write **GCS** URLs, not `https://chataura.in/uploads/...`.

---

## Preferred command

From `chataura_backend_nest` (with `.env` / GCS credentials loaded):

```bash
# Extract example
mkdir -p /tmp/chataura_gifts_gcs_v1
cd /tmp/chataura_gifts_gcs_v1
unzip -o /path/to/chataura_gifts_gcs_v1.zip
# If zip contains gifts_gcs_migrate/, use that folder:
DIR=/tmp/chataura_gifts_gcs_v1/gifts_gcs_migrate

cd /var/www/chataura_backend_next/chataura_backend_nest   # adjust to real path
npm run gifts:import -- --dir="$DIR" --out=/tmp/gift_gcs_urls.json
```

---

## Safety rules

- **No `git pull` that overwrites local VPS assets** for this task.
- Do not rename gift `name` / `category` / `coin_cost` vs MANIFEST.
- Do not modify Android.
- Do not delete Nest `uploads/` (may remain as legacy; DB should point at GCS).
- Keep Rockit / rooms / rankings code intact.

---

## Acceptance checklist

- [ ] All MANIFEST media files exist on GCS under `gifts/v1/...`
- [ ] Every gift has active `gifts` row with working HTTPS `image_url` + `animation_url`
- [ ] Spot-check 4 URLs in browser/curl: CP png, CP webm, lucky webm, flag png
- [ ] `GET /api/v2/gift-types` (or project path) returns GCS URLs for Lucky Clover / a CP gift / a flag
- [ ] `/tmp/gift_gcs_urls.json` written with full gift list
- [ ] `failed` array empty (or documented)

---

## Deliverable message format (reply to human)

When done, reply with:

1. GCS bucket name used  
2. Prefix (`gifts/v1`)  
3. `ok_count` / `failed`  
4. Paste or attach `/tmp/gift_gcs_urls.json` (full contents)  
5. Confirm `GIFTS_PUBLIC_BASE` or `GCS_BUCKET` used so ensure* won’t wipe URLs  
6. Any keys that failed + why  

Example shape:

```json
{
  "bucket": "chataura",
  "prefix": "gifts/v1",
  "ok_count": 95,
  "failed": [],
  "gifts": [
    {
      "name": "Lucky Clover",
      "category": "lucky",
      "gift_id": "123",
      "gift_key": "lucky_clover",
      "image_url": "https://storage.googleapis.com/chataura/gifts/v1/lucky/lucky_gift_lucky_clover.png",
      "animation_url": "https://storage.googleapis.com/chataura/gifts/v1/lucky/lucky_fx_lucky_clover.webm"
    }
  ]
}
```

---

## Human handoff after you finish

The human will verify the Android gift panel still shows the same gifts (absolute HTTPS URLs — no APK change). Keep `/tmp/gift_gcs_urls.json` until confirmed.
