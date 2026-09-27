# ChatAura Android: backend changes handoff

Brief for the Android agent. The backend (`https://chataura.in/api/v2`, NestJS) is the source of truth. Every item below is already live on the server. Items are cumulative; work through them in order.

**Global rules**
- **No breaking changes:** no field was removed or renamed, and older app builds keep working.
- **Responses:** wrapped as `{ "success": true, "data": { ... } }`. Errors: `{ "success": false, "error": { "code", "message" } }`.
- **Auth:** unchanged (`Authorization: Bearer <access_token>`).
- **Existing code:** where the app already has an implementation (for example Lucky gift UI from the Laravel era), adapt it to the contracts here rather than duplicating it.

---

## 1. Coin balance: single source of truth (live 2026-09-27)

**Backend change:** coins now live in one column. `coins`, `coin_balance`, and `wallet_balance` are still sent everywhere and always hold the same value.

**Android tasks**
- Read one field, `coins`, for display and for all "can afford" checks.
- Remove any logic that picks or compares `coin_balance` vs `wallet_balance`, or shows them separately.
- After any coin action (gift, game, purchase, conversion), set the displayed balance from the server response (see item 2). Never compute it locally.

**Endpoints returning balances:** `GET /users/me`, `GET /users/me/balance` (alias `/users/me/wallet`), plus every gift, game, recharge, and conversion response (`balances.coins`).

---

## 2. Lucky gift rebate (live 2026-09-27)

**Rule:** when a gift with `category: "lucky"` is sent, the sender instantly gets a random 1-40% of the gift's total value back as coins. The range is admin-configurable. The receiver still gets gems on the full value.

**Endpoints and response fields**

Single room gift, `POST /rooms/{roomId}/gifts/send`, and DM gift, `POST /wallet/send-gift`:

```json
{
  "transaction_id": "...",
  "coin_amount": 19999,
  "sender_balance_after": 125790,
  "receiver_gems_after": 48006,
  "lucky_rebate": { "pct": 29, "coins": 5799 },
  "balances": { "coins": 125790, "gems": 0, "referral_balance": 0 }
}
```

Bulk room gift, `POST /gifts/send-batch`:

```json
{
  "transaction_ids": ["...", "..."],
  "coin_amount": 39998,
  "receiver_count": 2,
  "sender_balance_after": 71000,
  "lucky_rebate": {
    "coins": 11200,
    "items": [
      { "receiver_id": 12, "pct": 34, "coins": 6799 },
      { "receiver_id": 45, "pct": 22, "coins": 4399 }
    ]
  }
}
```

- `lucky_rebate` is `null` for non-lucky gifts, so show nothing.
- `balances.coins` and `sender_balance_after` already include the rebate.
- The rebate can be `coins: 0` (for example on a very cheap gift). Show nothing in that case.

**Android tasks**
- After a successful send, if `lucky_rebate != null && lucky_rebate.coins > 0`, show the Lucky win popup or animation:
  - single and DM gifts: "You won {pct}% back: +{coins} coins"
  - bulk gifts: the total `coins`, optionally listing `items`
- Set the wallet balance from `balances.coins` (single/DM) or `sender_balance_after` (bulk). Do not subtract the gift cost locally; that hides the rebate until the next refresh.
- Parse `lucky_rebate` as nullable and ignore unknown fields, so a missing field on older data never crashes.

---

## 3. Transaction history: new entry types (live 2026-09-27)

**Endpoint:** `GET /wallet/transactions?page=&limit=&filter=` (alias `/users/me/transactions`). `filter` is `earned` or `expense`.

**Item shape (unchanged):** `{ id, type, title, coin_amount, net_amount, commission_amount, status, created_at }`

| `type` | Show as | Amount to display |
|---|---|---|
| `LUCKY_GIFT_REBATE` | "Lucky gift reward" | `+coin_amount` coins |
| `BALANCE_MERGE` | "Balance correction" | `+coin_amount` coins |
| `GIFT_RECEIVED` | "Gift received" | `+net_amount` **gems** (`coin_amount` is 0) |
| `STAR_CHAT_EARNED` | "Star chat earnings" | `+net_amount` **gems** (`coin_amount` is 0) |
| `PARTY_GEMS`, `AGENCY_WEEKLY_PAYOUT` | existing labels | `+net_amount` **gems** where present |
| `XP` | hide, or show as XP | not coins (`coin_amount` is 0) |

**Android tasks**
- Map the types above to friendly labels and fall back to `title` for unknown types.
- Rows with `coin_amount == 0` and a `net_amount` are gem entries: show a gem icon and amount, never "0 coins".

---

## 4. CP / BCP: one partner, formed by gifting, paid break (live 2026-09-27)

**Rules (identical for CP and BCP; values come from the API, never hard-code them)**
- **One partner:** each user can have at most one CP and one BCP (`max_partners: 1`).
- **Forming:** there is no invite or accept any more. The two users' combined CP gifts (or BCP gifts), in both directions, add up. When the total reaches `formation_threshold_coins` (2,000,000), the pair forms automatically.
- **Blocked pairs:** if either user already has a partner of that type, progress keeps accumulating but the pair does not form. It forms on the next qualifying gift once both users are free.
- **Breaking:** costs `unbind_cost_coins` (3,000,000), paid by the user who taps Remove. Level, score, and progress reset to 0, and re-forming needs the full threshold again.

**Type config:** `GET /relationship-types`. Each type has new or changed fields:

```json
{ "code": "cp", "max_partners": 1, "formation_threshold_coins": 2000000,
  "unbind_cost_coins": 3000000, "requires_accept": false, "formation_cost_coins": 0,
  "visual": { "rules": "How to become CP? ..." } }
```

**Gift responses.** Room, bulk, and DM gift responses carry `relationship` (the `relationships[]` array for bulk gifts). This object has a new field, `formation_progress`:

```json
"relationship": {
  "applied": true, "created": false, "contribution": 1500000,
  "relationship": null,
  "formation_progress": {
    "type_code": "cp", "user_a_id": 12, "user_b_id": 45,
    "progress_coins": 1500000, "threshold_coins": 2000000, "remaining_coins": 500000,
    "formed": false, "blocked_reason": null
  },
  "visual_hints": { "show_formed_ceremony": false, "show_rank1_badge": false }
}
```

- **Still building:** `relationship: null`, and `formation_progress` shows the progress.
- **Forming gift:** `created: true`, `formation_progress.formed: true`, `visual_hints.show_formed_ceremony: true`, and `relationship` is filled.
- **Existing pair:** `formation_progress: null`, and `relationship` carries the score as before.
- **`blocked_reason`:** `null`, `"SENDER_HAS_PARTNER"`, or `"RECEIVER_HAS_PARTNER"`.

**My relationships:** `GET /relationships/me?type=cp|bcp` adds `formation_threshold_coins` and `in_progress[]`:

```json
"in_progress": [
  { "relationship_id": "uuid", "type_code": "cp", "type_name": "CP",
    "partner": { "id": 45, "name": "Riya", "avatar_url": "..." },
    "progress_coins": 1500000, "threshold_coins": 2000000, "remaining_coins": 500000,
    "updated_at": "2026-09-27T07:30:00.000Z" }
]
```

`items[]` contains only formed pairs (at most one per type).

**Errors**

| Endpoint | `error.code` | Meaning |
|---|---|---|
| `POST /relationships/invite` | `FORMATION_BY_GIFTS` | Invites are disabled; the pair forms by gifting |
| `POST /relationships/{id}/unbind` | `INSUFFICIENT_BALANCE` | Not enough coins to break (3,000,000) |
| `POST /relationships/{id}/unbind` | `NOT_FORMED` | Pair is still building; nothing to break |

**Android tasks**
- Remove the BCP Invite / Accept UI (the Invite button on Profile and on Me > CP/BCP, plus the pending-invite list). Keep the CP/BCP hub, levels, privileges, rings, and leaderboards.
- After a CP or BCP gift, if `formation_progress` is present and not formed, show a progress toast or bar: "{progress_coins} / {threshold_coins}: {remaining_coins} more to become CP".
  - If `blocked_reason` is set, show instead: "You already have a CP" or "{name} already has a CP".
- Play the formed ceremony when `visual_hints.show_formed_ceremony == true`; this is existing behaviour, now triggered on the forming gift.
- In Me > CP/BCP with no partner, show the `in_progress[]` list (partner, progress bar, remaining coins) and a "Send CP gift" button.
- On Remove, the confirm dialog must say "Breaking costs {unbind_cost_coins} coins; level and progress will be lost". On success, refresh the balance with `GET /users/me/balance`. Handle `INSUFFICIENT_BALANCE` by sending the user to recharge.
- The Rules tab shows `visual.rules` from the API (already updated server-side). Remove any hard-coded rules text.
- Profile: show at most one CP and one BCP badge, from `GET /users/{id}/relationships/primary?type=cp|bcp`.

**Existing data:** users who had several partners kept only their highest-score pair. Ten extra pairs were ended, and no Android handling is needed for them.

---

## Acceptance checklist

- [ ] Profile, wallet, and gift sheet all show the same coin number (`coins`).
- [ ] Sending a Lucky gift shows the win popup with the correct % and coins, and the balance updates immediately to `balances.coins`.
- [ ] Sending a normal gift shows no popup, and the balance equals `balances.coins`.
- [ ] Bulk Lucky gift shows the total rebate, and the balance equals `sender_balance_after`.
- [ ] History shows friendly labels for the new types, and gem entries show gems, not "0 coins".
- [ ] A missing or `null` `lucky_rebate` never crashes the app.
- [ ] No Invite/Accept UI remains for CP or BCP.
- [ ] A CP/BCP gift below the threshold shows progress and remaining coins; the gift that crosses 2,000,000 plays the formed ceremony.
- [ ] Gifting someone who already has a CP shows the "already has a CP" message; the app does not crash on `relationship: null`.
- [ ] Remove shows the 3,000,000 cost, deducts it, refreshes the balance, and handles `INSUFFICIENT_BALANCE`.
- [ ] Me > CP/BCP shows `in_progress[]` when there is no partner; a profile shows at most one CP and one BCP.

---

## Change log

| Date | Item | Backend status |
|---|---|---|
| 2026-09-27 | 1. Single coin balance | Live |
| 2026-09-27 | 2. Lucky gift rebate fields | Live |
| 2026-09-27 | 3. New history entry types | Live |
| 2026-09-27 | 4. CP/BCP one partner, 2M gift threshold, 3M break | Live |
