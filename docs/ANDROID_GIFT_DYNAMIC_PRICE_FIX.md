# Android task: make gifts, stickers and frames fully server-driven (fix "more coins deducted than shown")

You are working on the ChatAura Android app. The backend has been fixed (it is deployed before this app release). Your job is to make the app match it. **Keep the UI, layouts, animations and UX exactly as they are now.** Only change where the data comes from and how gifts are identified and sent.

## 1. The problem

Users report: *"Kuch gift me coin jitna dikh raha us se jyada kat raha"*, meaning that for some gifts more coins are deducted than the price shown.

Root causes (the backend side is already fixed):

1. **Gift names are not unique.** The same name exists in different categories at very different prices. Examples from production:

   | Name | standard | other category |
   |---|---|---|
   | Wedding | 120,000 | cp: **1,200,000** |
   | Besties Crown | 50,000 | bcp: **200,000** |
   | Golden Slot | 150,000 | lucky: **49,999** |
   | Rose | 10 (id 1) | duplicate standard row (id 18) |

   Any app logic that identifies a gift by **name** (`NormalGiftIcons`, `DEFAULT_GIFTS`, name-keyed maps or caches) can show one gift's price while the server charges a different gift.
2. **Hardcoded or cached prices in the app.** `DEFAULT_GIFTS` in `GiftRepository.kt`, the price array in `StaticFramesProvider.kt` and `DEFAULT_STICKERS` in `StickerRepository.kt` can show stale prices. Admins now change prices in the admin panel, and those changes are permanent and immediate on the server.
3. **The server always charges the database price** of the gift it resolves. Whatever the app *shows* must therefore be the server's current price for that exact gift row.

## 2. What changed on the backend (API contract)

Base path: `/api/v2`. All changes are **additive**. Old fields are unchanged.

### 2.1 New field on every gift: `gift_key`

`gift_key` is a **permanent, unique, opaque string** per gift, for example `"cp.wedding"`, `"standard.wedding"`, `"lucky.golden_slot"` or `"standard.rose_18"`.

- It never changes, even when an admin renames, re-prices or re-categorises the gift.
- **Do not parse it.** It is an identifier only; use `category` for the category.
- It can be `null` only in a rare transient case: a gift created moments ago by a legacy script. Fall back to `id` in that case.

The field is returned by:

| Endpoint | Shape |
|---|---|
| `GET /gifts` | `{ gifts: [{ id, gift_key, name, coin_cost, category, image_url, animation_url, media_type, loop }] }` |
| `GET /gift-types` | the same as above, plus `coin_price` (always equal to `coin_cost`) |
| `GET /users/{id}/gifts`, `/users/{id}/gifts/sent` | each item now has `gift_key` |
| Socket event `room:gift_overlay` | now also has `gift_key` and `unit_coin_cost` (price of ONE gift) |

`category` is one of `standard | customize | lucky | cp | bcp`. Category-specific rules (CP/BCP relationship gifts, lucky rebate, rockets) are unchanged.

### 2.2 Sending a gift: new optional request fields

These endpoints:
- `POST /rooms/{roomId}/gifts/send`
- `POST /gifts/send-batch`
- `POST /wallet/send-gift`
- socket `gift.send` / `gift:send`

now accept these optional fields **in addition to** the existing ones:

```json
{
  "gift_id": 178,
  "gift_key": "standard.wedding",
  "gift_category": "standard",
  "gift_name": "Wedding",
  "expected_coin_cost": 120000,
  "receiver_id": 123,
  "quantity": 1
}
```

| Field | Meaning |
|---|---|
| `gift_id` | Server `id` from the gift list. Keep sending it. |
| `gift_key` | **Send it always.** The server matches on it exactly. |
| `gift_category` | The `category` from the same list item. |
| `gift_name` | Optional. If sent, it **must** be the `name` from the same server list item. |
| `expected_coin_cost` | **The unit price (for ONE gift) shown to the user**, i.e. `coin_cost` of that item. **Not** multiplied by quantity or by receiver count. |

Server rules:
- The gift is identified **only** by `gift_key` / `gift_id`. There is no partial or "contains" name matching any more.
- If `gift_key`, `gift_id`, `gift_name` and `gift_category` don't all describe the same row, the server rejects the request and **charges nothing**.
- Disabled gifts can no longer be sent; the server no longer re-activates them.
- If `expected_coin_cost` ≠ the current server price, the server rejects the request and **charges nothing**.
- The charge is: `coin_cost × quantity` per receiver. For batch sends, `coin_cost × quantity × eligible receivers`. Receivers who are not seated are skipped and not charged.

### 2.3 New success-response fields (additive)

The room send, batch send and DM send responses now also contain:
`gift_id`, `gift_key`, `unit_coin_cost`, `quantity`, plus the existing `coin_amount` (total actually deducted) and `sender_balance_after`.

**Always update the displayed balance from `sender_balance_after`**, never from a local subtraction.

### 2.4 New error codes (HTTP 409 unless noted). No coins are deducted for any of them.

Error body shape:

```json
{
  "success": false,
  "error": {
    "code": "GIFT_PRICE_CHANGED",
    "message": "Gift price has changed to 150000 coins. Please confirm again.",
    "details": {
      "gift": { "id": 178, "gift_key": "standard.wedding", "name": "Wedding",
                "category": "standard", "coin_cost": 150000, "is_active": true }
    }
  }
}
```

| code | When | What the app must do |
|---|---|---|
| `GIFT_PRICE_CHANGED` | The shown price ≠ the server price | Update that gift in the local list from `details.gift`, refresh the gift panel, and show a short message such as "Price updated to X coins". The user must tap send again; **do not auto-resend**. |
| `GIFT_MISMATCH` | The app's gift data is stale (id/key/name/category disagree) | Re-fetch `GET /gifts`, re-render, and ask the user to tap again. |
| `GIFT_INACTIVE` | An admin disabled the gift | Remove it from the local list, re-fetch the list, and show "This gift is no longer available". |
| `GIFT_AMBIGUOUS` | Only sent by name and multiple gifts match | Should never happen once you send `gift_key`. Re-fetch the list. |
| `GIFT_NOT_FOUND` (404) | Unknown id/key | Re-fetch the list. |
| `INSUFFICIENT_BALANCE` (400) | Unchanged | Unchanged. |

Over the socket (`gift.send`), the same `code`, `message` and `details` come back inside the ack payload.

## 3. Required Android changes

### 3.1 Gifts: `GiftRepository.kt`, gift panel, send flow
1. **The server list is the only source of truth for what is shown and sold.** Fetch `GET /gifts` (or `/gift-types`, whichever the app uses):
   - on app start,
   - **every time the gift panel opens** (show the cached list instantly, then replace it when the response arrives),
   - after any `GIFT_*` error above.
2. Add `giftKey: String?` to the gift model/DTO and persist it in any cache or DB entity (add a Room migration if gifts are stored in Room).
3. **Key every map, cache, selection state and RecyclerView diff by `gift_key`** (fall back to `id` if `gift_key` is null). **Never key by name.** Two different gifts can share a name.
4. `DEFAULT_GIFTS` (hardcoded list with prices):
   - Use it **only** to render a placeholder grid when there is no cached server list and the network fails.
   - While showing it, **disable sending** (or show "Loading gifts…"). Never send a request built from `DEFAULT_GIFTS`, because its ids and prices may not match the server.
   - Prefer replacing it with the last successful server response cached on disk.
5. The send request must be built **from the exact server list item the user tapped**:
   - `gift_id = item.id`
   - `gift_key = item.giftKey`
   - `gift_category = item.category`
   - `gift_name = item.name`
   - `expected_coin_cost = item.coinCost`
6. The price shown on the gift tile, in the confirm sheet and in combo/quantity UI must be `item.coinCost` from the server list. Show the total before sending:
   - single receiver: `coinCost × quantity`
   - "send to all" / multi-receiver: `coinCost × quantity × number of selected receivers`
7. Handle the error codes in §2.4 exactly as described.
8. After a successful send, set the balance from `sender_balance_after`.

### 3.2 Gift images: `NormalGiftIcons.kt`
The local drawables keep the panel instant, so keep them, but they must never override the server:
1. Re-key the mapping from **name → `gift_key`**. Current keys are listed in §5; the rule is `"<category>.<lowercase name with non-alphanumerics replaced by _>"`.
2. Rendering order:
   - If the server `image_url` / `animation_url` is present, load it with Glide/Coil and use the local drawable as the **placeholder/error** image.
   - Use the local drawable alone only when the server has no URL.

   This keeps today's look and zero-lag feel while letting admin-uploaded images appear.
3. The same applies to the overlay animation for `room:gift_overlay`: identify the gift by `gift_key` (fallback `gift_id`), and prefer the event's `animation_url`.

### 3.3 Frames: `StaticFramesProvider.kt`, `FramesCatalogCache.kt`, `RoleFramesPrefetcher.kt`
1. Server data from `GET /store/frames` (or `profile/frames`) and `GET /role-frames` always wins. This covers price, level, image/animation, `composite_mode` and active state.
2. The hardcoded slugs and price array may be used **only** as an offline placeholder. Never show a hardcoded price when a server value exists, and **disable "Buy"** while only fallback data is shown.
3. Refresh the frame catalog when the store screen opens, and after any purchase error.

### 3.4 Stickers: `StickerRepository.kt`
1. Server data from `GET /stickers` always wins for price, image and availability.
2. `DEFAULT_STICKERS` is an offline placeholder only. **Disable purchase** while showing it.
3. Refresh when the sticker panel opens; after a purchase, re-fetch.

### 3.5 Caching rules (all three catalogs)
- Do not use a long TTL for catalog JSON. Show the cache first, then always revalidate in the background when the panel or screen opens.
- Media files (images/animations) can stay cached aggressively. New admin uploads arrive under new URLs.

## 4. Acceptance tests (run all of them)

1. An admin changes the price of "Rose" (standard) from 10 to 15. Reopen the gift panel and it shows 15. Send it: 15 is deducted and the balance matches `sender_balance_after`.
2. With the panel already open on the old price, the admin changes the price. Tap send: you get `GIFT_PRICE_CHANGED`, no coins are deducted, the panel shows the new price, and the second tap succeeds at the new price.
3. Send "Wedding" from the **standard** tab: exactly 120,000 is deducted (not 1,200,000). Send "Wedding" from the **CP** tab: 1,200,000 (CP rules unchanged).
4. "Golden Slot" from the lucky tab is 49,999; from the standard tab it is 150,000. Each tab charges its own price.
5. An admin disables a gift: it disappears on the next panel open. Sending it from a stale panel gives `GIFT_INACTIVE` and no deduction.
6. An admin renames a gift: the same tile, icon and selection state stay (keyed by `gift_key`), and the new name is shown.
7. An admin uploads a new gift image: the app shows the new image, with the local drawable shown only while it loads.
8. Flight mode on a fresh install: the placeholder grid shows and sending/buying is disabled; turn the network on and the real list loads and sending works.
9. "Send to all" with 3 seated users and quantity 2 of a 100-coin gift: the confirm shows 600 and exactly 600 is deducted.
10. Frames and stickers: admin price changes are reflected on screen open, and buying charges the shown price.

## 5. Current `gift_key` values for gifts that share a name (for testing)

```
standard.wedding (120000)          cp.wedding (1200000)
standard.besties_crown (50000)     bcp.besties_crown (200000)
standard.golden_slot (150000)      lucky.golden_slot (49999)
standard.dragon_fortune (100000)   lucky.dragon_fortune (250000)
standard.mega_jackpot (200000)     lucky.mega_jackpot (500000)
standard.waltz                     cp.waltz
standard.forever_love              cp.forever_love
standard.flower_yacht              cp.flower_yacht
standard.galaxy_fireworks          cp.galaxy_fireworks
standard.love_carousel             cp.love_carousel
standard.wedding_hall              cp.wedding_hall
standard.bear_bouquet              cp.bear_bouquet
standard.rose (id 1)               standard.rose_18 (id 18, duplicate row)
```

Prices above are current values; they are admin-editable, so always read them from the API.

## 6. Do not
- Do not identify, cache or diff gifts by name.
- Do not compute balances locally after a send.
- Do not send a gift built from hardcoded/fallback data.
- Do not parse `gift_key`.
- Do not change gift categories, tabs, CP/BCP flows, animations or layouts beyond what is described here.
