#!/usr/bin/env python3
"""
ChatAura MySQL (Laravel) → PostgreSQL (Nest) ETL.

- Reads MySQL read-only; never deletes/modifies Laravel data.
- --dry-run: counts + mapping report only
- --sync: upsert gifts/frames/stickers and insert missing users. Never deletes.
- --apply: destructive truncate. Disabled unless ALLOW_DESTRUCTIVE_TRUNCATE=1.

Usage:
  python3 scripts/migrate_mysql_to_postgres.py --dry-run
  python3 scripts/migrate_mysql_to_postgres.py --sync
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Iterable

import pymysql
import psycopg2
import psycopg2.extras

ROOT = Path(__file__).resolve().parents[1]
LARAVEL_ENV = Path("/var/www/chataura/.env")
REPORT_DIR = ROOT / "backups"

# Nest tables truncated/loaded (child → parent reverse for truncate)
TRUNCATE_ORDER = [
    "media_saves",
    "media_likes",
    "media_comments",
    "media_items",
    "lucky77_bets",
    "lucky77_rounds",
    "greedy_bets",
    "greedy_rounds",
    "star_chat_sessions",
    "messages",
    "conversation_participants",
    "conversations",
    "seats",
    "room_blocks",
    "room_members",
    "rooms",
    "user_unlocked_stickers",
    "user_unlocked_frames",
    "bonus_claims",
    "agency_weekly_distributions",
    "agency_affiliations",
    "coin_transactions",
    "coin_purchase_transactions",
    "gem_conversions",
    "withdrawal_requests",
    "feedback",
    "user_reports",
    "blocked_users",
    "friend_requests",
    "friendships",
    "user_followers",
    "user_devices",
    "refresh_tokens",
    "users",
    "gifts",
    "stickers",
    "frames",
    "entry_bars",
    "room_themes",
    "banners",
    "music_tracks",
    "faq_items",
    "coin_packages",
    "levels",
    "admin_settings",
]

SKIP_MYSQL_TABLES = {
    "jobs",
    "failed_jobs",
    "job_batches",
    "cache",
    "cache_locks",
    "sessions",
    "migrations",
    "password_reset_tokens",
    "calls",
    "call_logs",
    "call_sessions",
    "chat_groups",
    "group_members",
    "countries",
    "languages",
    "nameplates",
    "role_frames",
    "wealth_privileges",
    "xp_sources",
    "level_economy_configs",
    "level_reward_maps",
    "party_room_bonus_tiers",
    "staff_commission_ledgers",
    "staff_role_transitions",
    "admin_staff",
    "agency_weekly_periods",
    "room_gift_cashback_progress",
    "user_report_logs",
    "user_room_presence_sessions",
    "referral_history",
    "transactions",
    "wallet_packages",
    "wallet_transactions",
    "gift_types",  # merged into gifts via virtual_gifts primarily; gift_types handled in gifts transform
}


def env_get(text: str, key: str, default: str = "") -> str:
    m = re.search(rf"^{re.escape(key)}=(.*)$", text, re.M)
    if not m:
        return default
    v = m.group(1).strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    return v


def mysql_connect():
    text = LARAVEL_ENV.read_text()
    return pymysql.connect(
        host=env_get(text, "DB_HOST", "127.0.0.1") or "127.0.0.1",
        port=int(env_get(text, "DB_PORT", "3306") or "3306"),
        user=env_get(text, "DB_USERNAME"),
        password=env_get(text, "DB_PASSWORD"),
        database=env_get(text, "DB_DATABASE"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def pg_connect():
    return psycopg2.connect(
        host="127.0.0.1",
        port=5433,
        user="chataura_user",
        password="chataura_dev",
        dbname="chataura_db",
    )


def rewrite_media_url(v: Any) -> Any:
    """Rewrite dead Laravel host so admin/app previews keep working."""
    if v is None or not isinstance(v, str):
        return v
    url = v.strip()
    if not url:
        return None
    url = url.replace("https://chataura.indsoft24.com", "https://chataura.in")
    url = url.replace("http://chataura.indsoft24.com", "https://chataura.in")
    return url


def to_pg(v: Any) -> Any:
    if isinstance(v, dict) or isinstance(v, list):
        return json.dumps(v, default=str)
    if isinstance(v, Decimal):
        return v
    if isinstance(v, (datetime, date)):
        return v
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace")
    return v


def boolish(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if s in ("1", "true", "yes", "on", "active"):
        return True
    if s in ("0", "false", "no", "off", "inactive"):
        return False
    return default


def fetch_all(cur, sql: str, args=None) -> list[dict]:
    cur.execute(sql, args or ())
    return list(cur.fetchall())


def table_exists(cur, name: str) -> bool:
    cur.execute("SHOW TABLES LIKE %s", (name,))
    return cur.fetchone() is not None


def count_mysql(cur, name: str) -> int:
    if not table_exists(cur, name):
        return -1
    cur.execute(f"SELECT COUNT(*) AS c FROM `{name}`")
    return int(cur.fetchone()["c"])


def count_pg(cur, name: str) -> int:
    cur.execute(f"SELECT COUNT(*) FROM {name}")
    return int(cur.fetchone()[0])


def upsert_by_id(
    pg,
    table: str,
    columns: list[str],
    rows: list[tuple],
    update_cols: list[str],
    page: int = 200,
):
    """Insert or update by primary key. Never deletes rows."""
    if not rows:
        return 0
    cols = ",".join(columns)
    updates = ", ".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
    sql = (
        f"INSERT INTO {table} ({cols}) VALUES %s "
        f"ON CONFLICT (id) DO UPDATE SET {updates}"
    )
    total = 0
    with pg.cursor() as cur:
        for i in range(0, len(rows), page):
            chunk = rows[i : i + page]
            psycopg2.extras.execute_values(cur, sql, chunk, page_size=page)
            total += len(chunk)
    return total


def upsert_by_slug(
    pg,
    table: str,
    columns: list[str],
    rows: list[tuple],
    update_cols: list[str],
    page: int = 200,
):
    """Insert or update by unique slug. Id is omitted so sequences assign new rows."""
    if not rows:
        return 0
    cols = ",".join(columns)
    updates = ", ".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
    sql = (
        f"INSERT INTO {table} ({cols}) VALUES %s "
        f"ON CONFLICT (slug) DO UPDATE SET {updates}"
    )
    total = 0
    with pg.cursor() as cur:
        for i in range(0, len(rows), page):
            chunk = rows[i : i + page]
            psycopg2.extras.execute_values(cur, sql, chunk, page_size=page)
            total += len(chunk)
    return total


def insert_ignore_by_id(
    pg,
    table: str,
    columns: list[str],
    rows: list[tuple],
    page: int = 200,
):
    """Insert rows; skip when primary key already exists."""
    if not rows:
        return 0
    cols = ",".join(columns)
    sql = f"INSERT INTO {table} ({cols}) VALUES %s ON CONFLICT (id) DO NOTHING"
    total = 0
    with pg.cursor() as cur:
        for i in range(0, len(rows), page):
            chunk = rows[i : i + page]
            psycopg2.extras.execute_values(cur, sql, chunk, page_size=page)
            total += len(chunk)
    return total


def insert_ignore_unique(
    pg,
    table: str,
    columns: list[str],
    rows: list[tuple],
    conflict: str,
    page: int = 200,
):
    if not rows:
        return 0
    cols = ",".join(columns)
    sql = f"INSERT INTO {table} ({cols}) VALUES %s ON CONFLICT {conflict} DO NOTHING"
    total = 0
    with pg.cursor() as cur:
        for i in range(0, len(rows), page):
            chunk = rows[i : i + page]
            psycopg2.extras.execute_values(cur, sql, chunk, page_size=page)
            total += len(chunk)
    return total


def insert_batch(pg, table: str, columns: list[str], rows: list[tuple], page: int = 500):
    if not rows:
        return 0
    cols = ",".join(columns)
    ph = ",".join(["%s"] * len(columns))
    sql = f"INSERT INTO {table} ({cols}) VALUES ({ph})"
    total = 0
    with pg.cursor() as cur:
        for i in range(0, len(rows), page):
            chunk = rows[i : i + page]
            # Use execute_values (safer than execute_batch multi-statement join)
            psycopg2.extras.execute_values(cur, f"INSERT INTO {table} ({cols}) VALUES %s", chunk, page_size=page)
            total += len(chunk)
    return total


def reset_sequences(pg):
    with pg.cursor() as cur:
        cur.execute(
            """
            SELECT c.relname AS seq, t.relname AS table_name, a.attname AS col
            FROM pg_class c
            JOIN pg_depend d ON d.objid = c.oid
            JOIN pg_class t ON t.oid = d.refobjid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
            WHERE c.relkind = 'S' AND t.relkind = 'r'
            """
        )
        seqs = cur.fetchall()
        for seq, table, col in seqs:
            cur.execute(
                f"SELECT setval(%s, COALESCE((SELECT MAX({col}) FROM {table}), 1), true)",
                (seq,),
            )


# ---------- transforms ----------

def transform_users(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "email", "phone", "password", "name", "display_name", "avatar_url", "bio",
        "gender", "dob", "language", "country", "role", "invite_code", "invited_by",
        "email_verified_at", "fcm_token", "level", "exp", "xp", "coin_balance",
        "wallet_balance", "total_earned_coins", "referral_balance", "gems",
        "inr_earnings_balance", "usd_earnings_balance", "private_account", "is_private",
        "show_online_status", "is_online", "last_seen_at", "is_suspended",
        "suspended_reason", "suspended_until", "account_status", "deleted_at",
        "is_star_account", "star_rank", "star_bio_tag", "audio_call_rate",
        "video_call_rate", "selected_frame_id", "selected_entry_bar_id",
        "last_client_country", "streak_count", "last_streak_at", "created_at", "updated_at",
    ]
    valid_roles = {"user", "seller", "admin", "agency"}
    valid_status = {"active", "suspended", "deleted", "pending"}
    out = []
    for r in rows:
        role = (r.get("role") or "user").lower()
        if role not in valid_roles:
            role = "user"
        status = (r.get("account_status") or "active").lower()
        if status not in valid_status:
            status = "active"
        email = (r.get("email") or None)
        if email:
            email = email.lower().strip() or None
        password = r.get("password") or ""
        if not password:
            password = "$2y$10$invalidhashinvalidhashinvalidhuXe"  # unreachable login
        out.append(
            tuple(
                to_pg(x)
                for x in [
                    r["id"],
                    email,
                    r.get("phone"),
                    password,
                    r.get("name"),
                    r.get("display_name"),
                    r.get("avatar_url"),
                    r.get("bio"),
                    r.get("gender"),
                    r.get("dob"),
                    r.get("language"),
                    r.get("country"),
                    role,
                    r.get("invite_code"),
                    r.get("invited_by"),
                    r.get("email_verified_at"),
                    r.get("fcm_token"),
                    int(r.get("level") or 1),
                    int(r.get("exp") or 0),
                    int(r.get("xp") or 0),
                    int(r.get("coin_balance") or 0),
                    int(r.get("wallet_balance") or 0),
                    int(r.get("total_earned_coins") or 0),
                    int(r.get("referral_balance") or 0),
                    int(r.get("gems") or 0),
                    int(r.get("inr_earnings_balance") or 0),
                    int(r.get("usd_earnings_balance") or 0),
                    boolish(r.get("private_account")),
                    boolish(r.get("is_private")),
                    boolish(r.get("show_online_status"), True),
                    False,
                    r.get("last_seen_at"),
                    boolish(r.get("is_suspended")),
                    r.get("suspended_reason"),
                    r.get("suspended_until"),
                    status,
                    r.get("deleted_at"),
                    boolish(r.get("is_star_account")),
                    r.get("star_rank"),
                    r.get("star_bio_tag"),
                    None,
                    None,
                    r.get("selected_frame_id"),
                    r.get("selected_entry_bar_id"),
                    r.get("last_client_country"),
                    int(r.get("streak_count") or 0),
                    r.get("last_check_in_at"),
                    r.get("created_at") or datetime.utcnow(),
                    r.get("updated_at") or datetime.utcnow(),
                ]
            )
        )
    return cols, out


def transform_coin_packages(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "audience", "coins", "currency", "price", "original_price",
        "base_price_inr", "is_active", "sort_order", "created_at", "updated_at",
    ]
    out = []
    for i, r in enumerate(rows):
        price = r.get("base_price_inr") or 0
        out.append(
            (
                r["id"],
                r.get("audience") or "user",
                int(r.get("coins") or 0),
                "INR",
                to_pg(price),
                to_pg(price),
                to_pg(r.get("base_price_inr")),
                (str(r.get("status") or "active").lower() == "active"),
                i,
                to_pg(r.get("created_at") or datetime.utcnow()),
                to_pg(r.get("updated_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_gifts(vg: list[dict], gt: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = ["id", "name", "coin_cost", "image_url", "animation_url", "is_active", "created_at"]
    out = []
    used_ids = set()
    for r in vg:
        used_ids.add(int(r["id"]))
        out.append(
            (
                r["id"],
                r.get("name") or f"gift-{r['id']}",
                int(r.get("coin_cost") or 0),
                rewrite_media_url(r.get("image_url")),
                rewrite_media_url(r.get("animation_url")),
                boolish(r.get("is_active"), True),
                to_pg(r.get("created_at") or datetime.utcnow()),
            )
        )
    # Append gift_types with offset ids if not colliding by name
    next_id = (max(used_ids) + 1) if used_ids else 1
    existing_names = {o[1].lower() for o in out}
    for r in gt:
        name = r.get("name") or f"type-{r['id']}"
        if name.lower() in existing_names:
            continue
        out.append(
            (
                next_id,
                name,
                int(r.get("coin_price") or 0),
                rewrite_media_url(r.get("image_url")),
                rewrite_media_url(r.get("animation_url")),
                boolish(r.get("is_active"), True),
                to_pg(r.get("created_at") or datetime.utcnow()),
            )
        )
        next_id += 1
    return cols, out


def transform_coin_transactions(rows: list[dict]) -> tuple[list[str], list[tuple], dict]:
    """Laravel sender/receiver row → Nest per-user ledger rows (often 1→2)."""
    cols = [
        "user_id", "type", "title", "coin_amount", "net_amount", "commission_amount",
        "balance_after", "reference_id", "status", "meta", "created_at",
    ]
    out = []
    stats = {"source": len(rows), "emitted": 0, "skipped_no_party": 0}
    for r in rows:
        sender = r.get("sender_id")
        receiver = r.get("receiver_id")
        ttype = r.get("transaction_type") or "UNKNOWN"
        gross = int(r.get("gross_coins_deducted") or 0)
        commission = int(r.get("admin_commission_coins") or 0)
        net = int(r.get("net_coins_received") or 0)
        ref = str(r.get("reference_id") or r.get("id"))
        created = to_pg(r.get("created_at") or datetime.utcnow())
        meta = json.dumps(
            {
                "legacy_id": r.get("id"),
                "sender_id": sender,
                "receiver_id": receiver,
                "transaction_type": ttype,
            }
        )
        emitted = False
        if sender:
            out.append(
                (
                    sender,
                    ttype,
                    f"{ttype} debit",
                    -abs(gross) if gross else 0,
                    -abs(net) if net and sender == receiver else None,
                    commission if commission else None,
                    None,
                    ref[:128],
                    "success",
                    meta,
                    created,
                )
            )
            emitted = True
        if receiver and (receiver != sender or not sender):
            out.append(
                (
                    receiver,
                    ttype,
                    f"{ttype} credit",
                    abs(net) if net else abs(gross),
                    abs(net) if net else None,
                    commission if commission else None,
                    None,
                    ref[:128],
                    "success",
                    meta,
                    created,
                )
            )
            emitted = True
        if emitted:
            stats["emitted"] += 1 if (sender and receiver and sender != receiver) else 1
        else:
            stats["skipped_no_party"] += 1
    # fix emitted count = rows actually appended
    stats["emitted"] = len(out)
    return cols, out, stats


def transform_coin_purchases(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "user_id", "package_id", "razorpay_order_id", "razorpay_payment_id",
        "razorpay_signature", "amount_minor", "currency", "coins_credited", "status",
        "payment_source", "country", "created_at", "updated_at",
    ]
    valid_status = {"pending", "paid", "failed", "cancelled", "refunded"}
    valid_source = {"RAZORPAY", "ADMIN", "PROMO", "OTHER"}
    out = []
    for r in rows:
        status = (r.get("status") or "pending").lower()
        if status not in valid_status:
            status = "pending"
        src = (r.get("payment_source") or "RAZORPAY").upper()
        if src not in valid_source:
            src = "RAZORPAY"
        out.append(
            (
                r["id"],
                r["user_id"],
                r.get("package_id"),
                r.get("razorpay_order_id"),
                r.get("razorpay_payment_id"),
                None,
                int(r.get("amount_minor") or 0),
                r.get("currency") or "INR",
                int(r.get("coins") or 0),
                status,
                src,
                r.get("country") or r.get("billing_country"),
                to_pg(r.get("created_at") or datetime.utcnow()),
                to_pg(r.get("updated_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_admin_settings(row: dict | None) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "gems_per_coin", "min_gems_convert_to_coins", "coin_to_xp_ratio",
        "gift_commission_pct", "earnings_purchase_enabled", "cashout_enabled",
        "audio_call_price_per_min", "video_call_price_per_min", "star_chat_price_per_min",
        "star_chat_commission_pct", "star_chat_heartbeat_seconds", "spin_cost",
        "bonus_config", "updated_at",
    ]
    if not row:
        return cols, []
    bonus = {
        "signup_bonus_enabled": boolish(row.get("signup_bonus_enabled")),
        "signup_bonus_coins": row.get("signup_bonus_coins"),
        "referral_reward_referrer": row.get("referral_reward_referrer"),
        "referral_reward_referee": row.get("referral_reward_referee"),
    }
    out = [
        (
            1,
            to_pg(row.get("gems_per_coin") or 10),
            int(row.get("min_gems_convert_to_coins") or row.get("min_gems_convert") or 10),
            to_pg(row.get("coin_to_xp_ratio") or 0.1),
            to_pg(row.get("gift_commission_percent") or 20),
            boolish(row.get("earnings_purchase_enabled"), True),
            False,
            int(row.get("audio_call_price_per_min") or 20),
            int(row.get("video_call_price_per_min") or 40),
            int(row.get("star_chat_price_per_min") or 5),
            to_pg(row.get("star_chat_commission_percent") or 30),
            25,
            50,
            json.dumps(bonus),
            to_pg(row.get("updated_at") or datetime.utcnow()),
        )
    ]
    return cols, out


def transform_levels(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = ["id", "level", "min_xp", "max_xp", "label", "badge_url", "icon_url", "created_at"]
    INT_MAX = 2147483647
    out = []
    for r in rows:
        lid = int(r["id"])
        # Nest Level.minXp/maxXp are Int (32-bit); clamp oversized Laravel values
        min_xp = min(int(r.get("min_xp") or 0), INT_MAX)
        max_xp = min(int(r.get("max_xp") or 0), INT_MAX)
        out.append(
            (
                lid if lid > 0 else lid,  # keep 0 if present
                lid,
                min_xp,
                max_xp,
                r.get("label"),
                r.get("badge_url"),
                r.get("icon_url"),
                to_pg(r.get("created_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_frames(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "name", "slug", "category", "level_required", "coin_cost",
        "is_premium", "is_active", "image_url", "animation_key", "created_at",
    ]
    out = []
    for r in rows:
        out.append(
            (
                r["id"],
                r.get("name") or f"frame-{r['id']}",
                r.get("slug") or f"frame-{r['id']}",
                r.get("category"),
                int(r.get("level_required") or 1),
                int(r.get("coin_cost") or r.get("price_coins") or 0),
                boolish(r.get("is_premium")),
                boolish(r.get("is_active"), True),
                rewrite_media_url(r.get("preview_url") or r.get("animation_url")),
                r.get("animation_key"),
                to_pg(r.get("created_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_media_items(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "user_id", "kind", "media_type", "file_url", "thumbnail_url", "caption",
        "music_url", "effect_name", "duration", "aspect_ratio", "is_camera_recorded",
        "likes_count", "comments_count", "shares_count", "views_count", "is_deleted",
        "created_at", "updated_at",
    ]
    out = []
    for r in rows:
        kind = (r.get("type") or "post").lower()
        if kind not in ("post", "reel"):
            kind = "post"
        out.append(
            (
                r["id"],
                r["user_id"],
                kind,
                r.get("media_type") or "image",
                rewrite_media_url(r.get("file_url") or "") or "",
                rewrite_media_url(r.get("thumbnail_url")),
                r.get("caption"),
                rewrite_media_url(r.get("music_url")),
                r.get("effect_name"),
                r.get("duration"),
                r.get("aspect_ratio"),
                boolish(r.get("is_camera_recorded")),
                int(r.get("likes") or 0),
                int(r.get("comments") or 0),
                int(r.get("shares") or 0),
                0,
                False,
                to_pg(r.get("created_at") or datetime.utcnow()),
                to_pg(r.get("updated_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_role_frames(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    """Laravel role_frames → Nest frames(category=role). Slugs are prefixed to avoid avatar slug collisions."""
    cols = [
        "name",
        "slug",
        "category",
        "level_required",
        "coin_cost",
        "is_premium",
        "is_active",
        "image_url",
        "animation_url",
        "animation_key",
        "composite_mode",
        "created_at",
    ]
    out = []
    used_slugs: set[str] = set()
    for r in rows:
        role_key = (r.get("role_key") or "role").strip().lower() or "role"
        raw_slug = (r.get("slug") or "").strip()
        if raw_slug:
            slug = f"role-{raw_slug}"[:128]
        else:
            slug = f"role-{role_key}-{int(r['id'])}"[:128]
        base = slug
        n = 2
        while slug.lower() in used_slugs:
            slug = f"{base[:120]}-{n}"[:128]
            n += 1
        used_slugs.add(slug.lower())
        name = (r.get("label") or role_key or f"role-{r['id']}").strip()[:128]
        out.append(
            (
                name,
                slug,
                "role",
                1,
                0,
                False,
                boolish(r.get("is_active"), True),
                rewrite_media_url(r.get("preview_url")),
                rewrite_media_url(r.get("animation_url") or r.get("animation_url_lite")),
                role_key[:128],
                "alpha",
                to_pg(r.get("created_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_gem_conversions(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "user_id", "gems_debited", "currency", "coins_credited",
        "gems_balance_after", "wallet_balance_after", "gems_per_coin", "created_at",
    ]
    out = []
    for r in rows:
        currency = r.get("currency") or "COINS"
        out.append(
            (
                r["id"],
                r["user_id"],
                int(r.get("gems_debited") or 0),
                currency[:16],
                int(r.get("coins_credited") or 0),
                int(r.get("gems_after") or 0),
                int(r.get("coins_balance_after") or r.get("inr_balance_after") or 0)
                if r.get("coins_balance_after") is not None or r.get("inr_balance_after") is not None
                else None,
                to_pg(r.get("gems_per_coin_snapshot") or r.get("gems_per_rupee_snapshot") or 10),
                to_pg(r.get("created_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_withdrawals(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = ["id", "user_id", "amount", "currency", "withdrawal_source", "status", "note", "created_at", "updated_at"]
    valid = {"pending", "approved", "rejected", "completed", "cancelled"}
    out = []
    for r in rows:
        status = (r.get("status") or "pending").lower()
        if status not in valid:
            status = "pending"
        amount = r.get("inr_amount") or r.get("usd_amount") or r.get("gems_amount") or 0
        currency = "USD" if r.get("usd_amount") else "INR"
        out.append(
            (
                r["id"],
                r["user_id"],
                to_pg(amount),
                currency,
                (r.get("withdrawal_source") or "earnings")[:32],
                status,
                r.get("admin_note"),
                to_pg(r.get("created_at") or datetime.utcnow()),
                to_pg(r.get("updated_at") or datetime.utcnow()),
            )
        )
    return cols, out


def transform_rooms(rows: list[dict]) -> tuple[list[str], list[tuple]]:
    cols = [
        "id", "display_id", "title", "owner_id", "host_id", "co_host_id",
        "agora_channel_name", "max_seats", "is_live", "is_permanent", "cover_image_url",
        "description", "tags", "settings", "theme_id", "country_code", "allowed_country",
        "allowed_gender", "min_age", "max_age", "last_activity_at", "host_last_heartbeat_at",
        "ended_at", "created_at", "updated_at",
    ]
    out = []
    for r in rows:
        tags = r.get("tags")
        settings = r.get("settings")
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = [tags] if tags else None
        if isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                settings = None
        out.append(
            (
                r["id"],
                (str(r.get("display_id") or "").strip() or str(r["id"]).replace("-", "")[:8]),
                r.get("title") or "Room",
                r["owner_id"],
                r.get("host_id"),
                r.get("co_host_id"),
                r.get("agora_channel_name") or f"room_{r['id']}",
                int(r.get("max_seats") or 8),
                boolish(r.get("is_live")),
                False,
                r.get("cover_image_url"),
                r.get("description"),
                json.dumps(tags) if tags is not None else None,
                json.dumps(settings) if settings is not None else None,
                r.get("theme_id"),
                None,
                r.get("allowed_country"),
                r.get("allowed_gender"),
                r.get("min_age"),
                r.get("max_age"),
                r.get("last_activity_at"),
                r.get("host_last_heartbeat_at"),
                r.get("ended_at"),
                to_pg(r.get("created_at") or datetime.utcnow()),
                to_pg(r.get("updated_at") or datetime.utcnow()),
            )
        )
    # Ensure unique display_id (varchar 8)
    seen = set()
    fixed = []
    for row in out:
        did = row[1]
        base = did[:8]
        cand = base
        n = 0
        while cand in seen:
            n += 1
            suffix = str(n)
            cand = (base[: max(0, 8 - len(suffix))] + suffix)[:8]
        seen.add(cand)
        if cand != did:
            row = (row[0], cand) + row[2:]
        fixed.append(row)
    return cols, fixed


def copy_intersect(
    mysql_rows: list[dict],
    pg_columns: list[str],
    defaults: dict | None = None,
    coerce: dict[str, Callable] | None = None,
    renumber_id: bool = False,
) -> tuple[list[str], list[tuple]]:
    defaults = defaults or {}
    coerce = coerce or {}
    cols = list(pg_columns)
    out = []
    for idx, r in enumerate(mysql_rows, start=1):
        vals = []
        for c in cols:
            if renumber_id and c == "id":
                v = idx
            elif c in r and r[c] is not None:
                v = r[c]
            elif c in defaults:
                v = defaults[c]() if callable(defaults[c]) else defaults[c]
            else:
                v = r.get(c)
            if c in coerce:
                v = coerce[c](v)
            vals.append(to_pg(v))
        out.append(tuple(vals))
    return cols, out


def is_uuid_like(v):
    if v is None:
        return False
    s=str(v)
    return len(s)==36 and s.count("-")==4


def pg_id_types(pg) -> dict[str, str]:
    with pg.cursor() as cur:
        cur.execute(
            """
            SELECT table_name, data_type
            FROM information_schema.columns
            WHERE table_schema='public' AND column_name='id'
            """
        )
        return {r[0]: r[1] for r in cur.fetchall()}


def run(dry_run: bool) -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    report: dict[str, Any] = {
        "mode": "dry-run" if dry_run else "apply",
        "timestamp": ts,
        "tables": {},
        "skipped_mysql": sorted(SKIP_MYSQL_TABLES),
        "transforms": [],
        "errors": [],
    }

    my = mysql_connect()
    pg = pg_connect()
    my_cur = my.cursor()

    def note(table: str, **kwargs):
        report["tables"][table] = kwargs
        print(f"  {table}: {kwargs}")

    try:
        print("=== ChatAura MySQL → Postgres ETL ===")
        print(f"mode={'dry-run' if dry_run else 'apply'}")

        # Pre-counts
        mysql_counts = {}
        for t in [
            "users", "coin_packages", "virtual_gifts", "gift_types", "coin_transactions",
            "coin_purchase_transactions", "admin_settings", "levels", "frames", "entry_bars",
            "room_themes", "stickers", "banners", "music_tracks", "faq_items", "rooms",
            "room_members", "seats", "room_blocks", "refresh_tokens", "user_devices",
            "user_followers", "friendships", "friend_requests", "blocked_users", "user_reports",
            "gem_conversions", "withdrawal_requests", "conversations", "conversation_participants",
            "messages", "star_chat_sessions", "greedy_rounds", "greedy_bets", "lucky77_rounds",
            "lucky77_bets", "media_posts", "post_likes", "post_comments", "post_saves",
            "user_unlocked_frames", "user_unlocked_stickers", "agency_affiliations",
            "agency_weekly_distributions", "feedback", "user_bonus_grants",
        ]:
            mysql_counts[t] = count_mysql(my_cur, t)

        report["mysql_counts"] = mysql_counts
        print("MySQL source counts loaded.")

        if dry_run:
            report["transforms"] = [
                "virtual_gifts(+gift_types)→gifts",
                "coin_transactions sender/receiver→per-user ledger (1→N)",
                "media_posts→media_items; post_*→media_*",
                "user_bonus_grants→bonus_claims (best-effort)",
                "admin_settings/levels/frames/coin_packages column remap",
                "agency_affiliations.linked_room_id→room_id",
            ]
            out = REPORT_DIR / f"migration_report_{ts}_dryrun.md"
            out.write_text(
                "# Dry-run migration report\n\n"
                + json.dumps(report, indent=2, default=str)
                + "\n"
            )
            print(f"Wrote {out}")
            return 0

        pg_ids = pg_id_types(pg)
        report["pg_id_types"] = pg_ids

        def should_renumber(table: str, sample_id: Any) -> bool:
            pg_type = pg_ids.get(table, "")
            if pg_type in ("uuid",):
                return False
            if pg_type in ("bigint", "integer") and is_uuid_like(sample_id):
                return True
            return False

        # APPLY
        print("Truncating Nest PG tables (MySQL untouched)...")
        with pg.cursor() as cur:
            cur.execute("SET session_replication_role = replica;")
            for t in TRUNCATE_ORDER:
                cur.execute(f"TRUNCATE TABLE {t} CASCADE;")
            cur.execute("SET session_replication_role = DEFAULT;")
        pg.commit()

        def load(name: str, cols: list[str], rows: list[tuple], mysql_src: str, note_extra=None):
            n = insert_batch(pg, name, cols, rows)
            pg.commit()
            note(
                name,
                mysql_source=mysql_src,
                mysql_count=mysql_counts.get(mysql_src, mysql_counts.get(name)),
                inserted=n,
                extra=note_extra,
            )
            return n

        # 1 admin_settings
        rows = fetch_all(my_cur, "SELECT * FROM admin_settings LIMIT 1")
        cols, data = transform_admin_settings(rows[0] if rows else None)
        load("admin_settings", cols, data, "admin_settings")

        # 2 levels / frames / entry_bars / themes / stickers / banners / music / faq / packages
        cols, data = transform_levels(fetch_all(my_cur, "SELECT * FROM levels"))
        load("levels", cols, data, "levels")

        cols, data = transform_frames(fetch_all(my_cur, "SELECT * FROM frames"))
        load("frames", cols, data, "frames")

        if mysql_counts.get("entry_bars", 0) > 0:
            raw = fetch_all(my_cur, "SELECT * FROM entry_bars")
            cols, data = copy_intersect(
                raw,
                ["id", "name", "level_required", "image_url", "is_active", "created_at"],
                defaults={"is_active": True, "created_at": datetime.utcnow},
                coerce={"is_active": boolish},
            )
            load("entry_bars", cols, data, "entry_bars")

        if mysql_counts.get("room_themes", 0) >= 0:
            raw = fetch_all(my_cur, "SELECT * FROM room_themes") if table_exists(my_cur, "room_themes") else []
            cols, data = copy_intersect(
                raw,
                ["id", "name", "image_url", "coin_cost", "is_active", "created_at"],
                defaults={"coin_cost": 0, "is_active": True, "created_at": datetime.utcnow},
                coerce={"is_active": boolish, "coin_cost": lambda v: int(v or 0)},
            )
            load("room_themes", cols, data, "room_themes")

        if table_exists(my_cur, "stickers"):
            raw = fetch_all(my_cur, "SELECT * FROM stickers")
            cols, data = copy_intersect(
                raw,
                ["id", "name", "coin_cost", "image_url", "animation_url", "is_active", "created_at"],
                defaults={"coin_cost": 0, "is_active": True, "created_at": datetime.utcnow},
                coerce={"is_active": boolish, "coin_cost": lambda v: int(v or 0)},
            )
            load("stickers", cols, data, "stickers")

        if table_exists(my_cur, "banners"):
            raw = fetch_all(my_cur, "SELECT * FROM banners")
            # use intersection of common banner cols
            pg_cols = [
                "id", "title", "subtitle", "category", "badge_text", "image_url",
                "bg_color_start", "bg_color_end", "button_text", "action_type",
                "action_target", "details_content", "sort_order", "is_active",
                "created_at", "updated_at",
            ]
            cols, data = copy_intersect(
                raw,
                pg_cols,
                defaults={"sort_order": 0, "is_active": True, "created_at": datetime.utcnow, "updated_at": datetime.utcnow},
                coerce={"is_active": boolish, "sort_order": lambda v: int(v or 0)},
            )
            load("banners", cols, data, "banners")

        if table_exists(my_cur, "faq_items"):
            raw = fetch_all(my_cur, "SELECT * FROM faq_items")
            cols, data = copy_intersect(
                raw,
                ["id", "question", "answer", "sort_order", "created_at"],
                defaults={"sort_order": 0, "created_at": datetime.utcnow},
                coerce={"sort_order": lambda v: int(v or 0)},
            )
            load("faq_items", cols, data, "faq_items")

        if table_exists(my_cur, "music_tracks") and mysql_counts.get("music_tracks", 0) > 0:
            raw = fetch_all(my_cur, "SELECT * FROM music_tracks")
            cols, data = copy_intersect(
                raw,
                ["id", "title", "artist", "file_url", "is_trending", "created_at"],
                defaults={"is_trending": False, "created_at": datetime.utcnow},
                coerce={"is_trending": boolish},
            )
            load("music_tracks", cols, data, "music_tracks")

        cols, data = transform_coin_packages(fetch_all(my_cur, "SELECT * FROM coin_packages"))
        load("coin_packages", cols, data, "coin_packages")

        vg = fetch_all(my_cur, "SELECT * FROM virtual_gifts") if table_exists(my_cur, "virtual_gifts") else []
        gt = fetch_all(my_cur, "SELECT * FROM gift_types") if table_exists(my_cur, "gift_types") else []
        cols, data = transform_gifts(vg, gt)
        load("gifts", cols, data, "virtual_gifts", note_extra={"gift_types_merged": len(gt)})
        report["transforms"].append("virtual_gifts+gift_types→gifts")

        # users (clear invalid selected_frame_id FKs first by nulling unknowns after insert? set null if missing frames)
        frame_ids = {r["id"] for r in fetch_all(my_cur, "SELECT id FROM frames")} if table_exists(my_cur, "frames") else set()
        entry_ids = {r["id"] for r in fetch_all(my_cur, "SELECT id FROM entry_bars")} if table_exists(my_cur, "entry_bars") else set()
        users = fetch_all(my_cur, "SELECT * FROM users")
        for u in users:
            if u.get("selected_frame_id") and u["selected_frame_id"] not in frame_ids:
                u["selected_frame_id"] = None
            if u.get("selected_entry_bar_id") and u["selected_entry_bar_id"] not in entry_ids:
                u["selected_entry_bar_id"] = None
        cols, data = transform_users(users)
        load("users", cols, data, "users")
        user_ids = {u["id"] for u in users}

        # auth / social
        for table, pg_cols, coerce_map in [
            (
                "refresh_tokens",
                ["id", "user_id", "token", "expires_at", "created_at"],
                {},
            ),
            (
                "user_devices",
                ["id", "user_id", "device_id", "platform", "fcm_token", "created_at", "updated_at"],
                {},
            ),
            (
                "user_followers",
                ["id", "follower_id", "following_id", "status", "created_at"],
                {},
            ),
            (
                "friendships",
                ["id", "user_id", "friend_id", "created_at"],
                {},
            ),
            (
                "friend_requests",
                ["id", "sender_id", "receiver_id", "status", "created_at", "updated_at"],
                {},
            ),
            (
                "blocked_users",
                ["id", "blocker_id", "blocked_id", "created_at"],
                {},
            ),
            (
                "user_reports",
                ["id", "reporter_id", "reported_id", "reason", "description", "created_at"],
                {},
            ),
        ]:
            if not table_exists(my_cur, table):
                note(table, skipped=True)
                continue
            raw = fetch_all(my_cur, f"SELECT * FROM `{table}`")
            # Normalize Laravel column aliases
            for r in raw:
                if table == "user_reports":
                    if r.get("reported_id") is None and r.get("reported_user_id") is not None:
                        r["reported_id"] = r.get("reported_user_id")
                    if r.get("reason") is None and r.get("reason_category") is not None:
                        r["reason"] = r.get("reason_category")
            # Filter orphan user FKs
            filtered = []
            fk_keys = (
                "user_id", "follower_id", "following_id", "friend_id",
                "sender_id", "receiver_id", "blocker_id", "blocked_id",
                "reporter_id", "reported_id",
            )
            for r in raw:
                ok = True
                for k in fk_keys:
                    if r.get(k) is not None and r.get(k) not in user_ids:
                        ok = False
                        break
                if ok:
                    filtered.append(r)
            renumber = (
                pg_ids.get(table) in ("bigint", "integer")
                and bool(filtered)
                and is_uuid_like(filtered[0].get("id"))
            )
            print(f"    social {table}: pg_id={pg_ids.get(table)} renumber={renumber} rows={len(filtered)}")
            cols, data = copy_intersect(
                filtered,
                pg_cols,
                defaults={"created_at": datetime.utcnow, "updated_at": datetime.utcnow, "status": "accepted"},
                renumber_id=renumber,
            )
            # Nest refresh_tokens.token is varchar(64); Laravel may be longer
            if table == "refresh_tokens" and data:
                idx = cols.index("token")
                id_idx = cols.index("id")
                data = [
                    tuple(
                        (str(v) if i == id_idx else (str(v)[:64] if i == idx else v))
                        for i, v in enumerate(row)
                    )
                    for row in data
                ]
            load(table, cols, data, table, note_extra={"filtered_from": len(raw)})

        # wallet
        cols, data = transform_coin_purchases(
            fetch_all(my_cur, "SELECT * FROM coin_purchase_transactions")
            if table_exists(my_cur, "coin_purchase_transactions")
            else []
        )
        # drop purchases with missing package/user
        pkg_ids = {x["id"] for x in fetch_all(my_cur, "SELECT id FROM coin_packages")}
        data2 = [row for row in data if row[1] in user_ids and (row[2] is None or row[2] in pkg_ids)]
        # unique razorpay ids: skip null duplicates by leaving nulls
        seen_order, seen_pay = set(), set()
        cleaned = []
        for row in data2:
            order_id, pay_id = row[3], row[4]
            if order_id and order_id in seen_order:
                continue
            if pay_id and pay_id in seen_pay:
                continue
            if order_id:
                seen_order.add(order_id)
            if pay_id:
                seen_pay.add(pay_id)
            cleaned.append(row)
        load("coin_purchase_transactions", cols, cleaned, "coin_purchase_transactions")

        ctx_rows = fetch_all(my_cur, "SELECT * FROM coin_transactions")
        cols, data, stats = transform_coin_transactions(ctx_rows)
        data = [r for r in data if r[0] in user_ids]
        load("coin_transactions", cols, data, "coin_transactions", note_extra=stats)
        report["transforms"].append("coin_transactions 1→N ledger")

        if table_exists(my_cur, "gem_conversions"):
            cols, data = transform_gem_conversions(fetch_all(my_cur, "SELECT * FROM gem_conversions"))
            data = [r for r in data if r[1] in user_ids]
            load("gem_conversions", cols, data, "gem_conversions")

        if table_exists(my_cur, "withdrawal_requests"):
            cols, data = transform_withdrawals(fetch_all(my_cur, "SELECT * FROM withdrawal_requests"))
            data = [r for r in data if r[1] in user_ids]
            load("withdrawal_requests", cols, data, "withdrawal_requests")

        # rooms
        room_rows = fetch_all(my_cur, "SELECT * FROM rooms")
        # only rooms with valid owners
        room_rows = [r for r in room_rows if r.get("owner_id") in user_ids]
        # null invalid host/cohost
        for r in room_rows:
            if r.get("host_id") not in user_ids:
                r["host_id"] = r.get("owner_id")
            if r.get("co_host_id") not in user_ids:
                r["co_host_id"] = None
            if r.get("theme_id"):
                # leave; FK may fail — null if theme missing later
                pass
        theme_ids = set()
        if table_exists(my_cur, "room_themes"):
            theme_ids = {x["id"] for x in fetch_all(my_cur, "SELECT id FROM room_themes")}
        for r in room_rows:
            if r.get("theme_id") and r["theme_id"] not in theme_ids:
                r["theme_id"] = None
        cols, data = transform_rooms(room_rows)
        bad = [r for r in data if not r[1]]
        if bad:
            raise RuntimeError(f"rooms display_id still empty for {len(bad)} rows e.g. {bad[0][:3]}")
        load("rooms", cols, data, "rooms")
        room_ids = {r["id"] for r in room_rows}

        if table_exists(my_cur, "room_members"):
            raw = fetch_all(my_cur, "SELECT * FROM room_members")
            raw = [r for r in raw if r.get("room_id") in room_ids and r.get("user_id") in user_ids]
            role_map = {"host": "host", "co_host": "co_host", "cohost": "co_host", "speaker": "speaker", "listener": "listener", "member": "listener"}
            for r in raw:
                r["role"] = role_map.get((r.get("role") or "listener").lower(), "listener")
            # Dedupe Nest unique(room_id, user_id) — keep latest by joined_at/id
            dedup = {}
            for r in raw:
                uid = r.get("user_id")
                if uid is None:
                    continue
                key = (str(r.get("room_id")), int(uid))
                prev = dedup.get(key)
                if prev is None:
                    dedup[key] = r
                    continue
                prev_joined = prev.get("joined_at") or datetime(1970, 1, 1)
                cur_joined = r.get("joined_at") or datetime(1970, 1, 1)
                prev_score = (1 if boolish(prev.get("is_active")) else 0, prev_joined)
                cur_score = (1 if boolish(r.get("is_active")) else 0, cur_joined)
                if cur_score >= prev_score:
                    dedup[key] = r
            raw = list(dedup.values())
            cols, data = copy_intersect(
                raw,
                ["id", "room_id", "user_id", "role", "seat_index", "agora_uid", "is_active", "last_heartbeat_at", "joined_at"],
                defaults={"is_active": False, "joined_at": datetime.utcnow},
                coerce={"is_active": boolish},
                renumber_id=True,  # MySQL room_members.id is UUID; Nest is bigint
            )
            # Final safety dedupe on transformed tuples
            seen_pair = set()
            data2 = []
            for row in data:
                pair = (str(row[1]), int(row[2]))
                if pair in seen_pair:
                    continue
                seen_pair.add(pair)
                data2.append(row)
            data = data2
            print(f"    room_members rows={len(data)} first_id={data[0][0] if data else None}")
            load("room_members", cols, data, "room_members")

        if table_exists(my_cur, "seats"):
            raw = fetch_all(my_cur, "SELECT * FROM seats")
            raw = [r for r in raw if r.get("room_id") in room_ids and (r.get("user_id") is None or r.get("user_id") in user_ids)]
            # Dedupe unique(room_id, seat_index)
            dedup = {}
            for r in raw:
                key = (r.get("room_id"), r.get("seat_index"))
                dedup[key] = r
            raw = list(dedup.values())
            cols, data = copy_intersect(
                raw,
                ["id", "room_id", "seat_index", "user_id", "is_muted", "muted_by_user_id", "is_locked", "last_heartbeat_at"],
                defaults={"is_muted": False, "is_locked": False},
                coerce={"is_muted": boolish, "is_locked": boolish},
                renumber_id=True,  # MySQL seats.id is UUID; Nest is bigint
            )
            load("seats", cols, data, "seats")

        if table_exists(my_cur, "room_blocks"):
            raw = fetch_all(my_cur, "SELECT * FROM room_blocks")
            raw = [r for r in raw if r.get("room_id") in room_ids and r.get("user_id") in user_ids]
            cols, data = copy_intersect(
                raw,
                ["id", "room_id", "user_id", "reason", "kind", "expires_at", "created_at"],
                defaults={"kind": "block", "created_at": datetime.utcnow},
            )
            load("room_blocks", cols, data, "room_blocks")

        # chat
        if table_exists(my_cur, "conversations"):
            raw = fetch_all(my_cur, "SELECT * FROM conversations")
            for r in raw:
                t = (r.get("type") or "direct").lower()
                r["type"] = t if t in ("direct", "group") else "direct"
            cols, data = copy_intersect(
                raw,
                ["id", "type", "name", "image_url", "created_at", "updated_at"],
                defaults={"created_at": datetime.utcnow, "updated_at": datetime.utcnow},
            )
            load("conversations", cols, data, "conversations")
            conv_ids = {r["id"] for r in raw}
        else:
            conv_ids = set()

        if table_exists(my_cur, "conversation_participants"):
            raw = fetch_all(my_cur, "SELECT * FROM conversation_participants")
            raw = [r for r in raw if r.get("conversation_id") in conv_ids and r.get("user_id") in user_ids]
            cols, data = copy_intersect(
                raw,
                ["id", "conversation_id", "user_id", "last_read_at", "created_at"],
                defaults={"created_at": datetime.utcnow},
            )
            load("conversation_participants", cols, data, "conversation_participants")

        if table_exists(my_cur, "messages"):
            raw = fetch_all(my_cur, "SELECT * FROM messages")
            raw = [r for r in raw if r.get("conversation_id") in conv_ids and r.get("sender_id") in user_ids]
            gift_ids = {g[0] for g in []}
            # reload gifts ids from what we inserted — use mysql virtual gift ids
            gift_ids = {x["id"] for x in vg}
            for r in raw:
                if r.get("gift_id") and r["gift_id"] not in gift_ids:
                    r["gift_id"] = None
                # message_text fallback
                if not r.get("message_text") and r.get("message"):
                    r["message_text"] = r.get("message")
                if not r.get("message_media") and r.get("image_url"):
                    r["message_media"] = r.get("image_url")
            cols, data = copy_intersect(
                raw,
                [
                    "id", "conversation_id", "sender_id", "message_type", "message_text",
                    "message_media", "gift_id", "sticker_id", "status", "client_uuid", "created_at",
                ],
                defaults={"message_type": "text", "status": "sent", "created_at": datetime.utcnow},
            )
            load("messages", cols, data, "messages")

        if table_exists(my_cur, "star_chat_sessions"):
            raw = fetch_all(my_cur, "SELECT * FROM star_chat_sessions")
            raw = [
                r
                for r in raw
                if r.get("payer_id") in user_ids
                and r.get("star_user_id") in user_ids
                and (r.get("conversation_id") is None or r.get("conversation_id") in conv_ids)
            ]
            cols, data = copy_intersect(
                raw,
                [
                    "id", "conversation_id", "payer_id", "star_user_id", "status", "started_at",
                    "ended_at", "payer_heartbeat_at", "price_per_min", "commission_percent",
                    "coins_charged", "gems_credited", "end_reason",
                ],
                defaults={"status": "ended", "price_per_min": 5, "commission_percent": 30, "coins_charged": 0, "gems_credited": 0},
            )
            load("star_chat_sessions", cols, data, "star_chat_sessions")

        # games — best effort column intersect
        for table in ("greedy_rounds", "lucky77_rounds"):
            if not table_exists(my_cur, table):
                continue
            raw = fetch_all(my_cur, f"SELECT * FROM `{table}`")
            raw = list({r["id"]: r for r in raw}.values())
            cols, data = copy_intersect(
                raw,
                ["id", "phase", "betting_ends_at", "winning_item", "winning_multiplier", "settled_at", "created_at"],
                defaults={"phase": "completed", "created_at": datetime.utcnow},
            )
            # phase enum normalize
            fixed = []
            for row in data:
                phase = str(row[1] or "completed").lower()
                if phase not in ("betting", "drawing", "completed"):
                    phase = "completed"
                fixed.append((row[0], phase) + row[2:])
            load(table, cols, fixed, table)

        round_ids = {
            "greedy": {r["id"] for r in fetch_all(my_cur, "SELECT id FROM greedy_rounds")} if table_exists(my_cur, "greedy_rounds") else set(),
            "lucky77": {r["id"] for r in fetch_all(my_cur, "SELECT id FROM lucky77_rounds")} if table_exists(my_cur, "lucky77_rounds") else set(),
        }

        if table_exists(my_cur, "greedy_bets"):
            raw = fetch_all(my_cur, "SELECT * FROM greedy_bets")
            raw = [r for r in raw if r.get("round_id") in round_ids["greedy"] and r.get("user_id") in user_ids]
            cols, data = copy_intersect(
                raw,
                [
                    "id", "round_id", "user_id", "item", "chip_amount", "multiplier",
                    "potential_payout", "actual_payout", "status", "created_at",
                ],
                defaults={"status": "settled", "created_at": datetime.utcnow},
            )
            load("greedy_bets", cols, data, "greedy_bets")

        if table_exists(my_cur, "lucky77_bets"):
            raw = fetch_all(my_cur, "SELECT * FROM lucky77_bets")
            # column may be option vs item
            for r in raw:
                if "option" not in r and "item" in r:
                    r["option"] = r["item"]
            raw = [r for r in raw if r.get("round_id") in round_ids["lucky77"] and r.get("user_id") in user_ids]
            cols, data = copy_intersect(
                raw,
                [
                    "id", "round_id", "user_id", "option", "chip_amount", "multiplier",
                    "potential_payout", "actual_payout", "status", "created_at",
                ],
                defaults={"status": "settled", "created_at": datetime.utcnow},
            )
            load("lucky77_bets", cols, data, "lucky77_bets")

        # media
        if table_exists(my_cur, "media_posts"):
            raw = fetch_all(my_cur, "SELECT * FROM media_posts")
            raw = [r for r in raw if r.get("user_id") in user_ids]
            cols, data = transform_media_items(raw)
            load("media_items", cols, data, "media_posts")
            media_ids = {r["id"] for r in raw}
            report["transforms"].append("media_posts→media_items")

            if table_exists(my_cur, "post_likes"):
                likes = fetch_all(my_cur, "SELECT * FROM post_likes")
                likes = [r for r in likes if r.get("media_post_id") in media_ids and r.get("user_id") in user_ids]
                rows = [
                    (r["id"], r["media_post_id"], r["user_id"], to_pg(r.get("created_at") or datetime.utcnow()))
                    for r in likes
                ]
                load("media_likes", ["id", "media_id", "user_id", "created_at"], rows, "post_likes")

            if table_exists(my_cur, "post_comments"):
                comments = fetch_all(my_cur, "SELECT * FROM post_comments")
                comments = [r for r in comments if r.get("media_post_id") in media_ids and r.get("user_id") in user_ids]
                rows = [
                    (
                        r["id"],
                        r["media_post_id"],
                        r["user_id"],
                        r.get("comment") or "",
                        to_pg(r.get("created_at") or datetime.utcnow()),
                    )
                    for r in comments
                ]
                load("media_comments", ["id", "media_id", "user_id", "comment", "created_at"], rows, "post_comments")

            if table_exists(my_cur, "post_saves"):
                saves = fetch_all(my_cur, "SELECT * FROM post_saves")
                saves = [r for r in saves if r.get("media_post_id") in media_ids and r.get("user_id") in user_ids]
                rows = [
                    (r["id"], r["media_post_id"], r["user_id"], to_pg(r.get("created_at") or datetime.utcnow()))
                    for r in saves
                ]
                load("media_saves", ["id", "media_id", "user_id", "created_at"], rows, "post_saves")

        # agency
        if table_exists(my_cur, "agency_affiliations"):
            raw = fetch_all(my_cur, "SELECT * FROM agency_affiliations")
            status_map = {"active": "accepted", "accepted": "accepted", "pending": "pending", "rejected": "rejected", "left": "left"}
            for r in raw:
                if "room_id" not in r or r.get("room_id") is None:
                    r["room_id"] = r.get("linked_room_id")
                r["status"] = status_map.get(str(r.get("status") or "pending").lower(), "pending")
            raw = [
                r
                for r in raw
                if r.get("agency_user_id") in user_ids
                and r.get("room_owner_id") in user_ids
                and (r.get("room_id") is None or r.get("room_id") in room_ids)
            ]
            cols, data = copy_intersect(
                raw,
                [
                    "id", "agency_user_id", "room_owner_id", "room_id", "status",
                    "joined_at", "left_at", "cooldown_until", "created_at", "updated_at",
                ],
                defaults={"status": "pending", "created_at": datetime.utcnow, "updated_at": datetime.utcnow},
            )
            load("agency_affiliations", cols, data, "agency_affiliations")

        if table_exists(my_cur, "agency_weekly_distributions"):
            raw = fetch_all(my_cur, "SELECT * FROM agency_weekly_distributions")
            periods = {}
            if table_exists(my_cur, "agency_weekly_periods"):
                periods = {p["id"]: p for p in fetch_all(my_cur, "SELECT * FROM agency_weekly_periods")}
            for r in raw:
                p = periods.get(r.get("period_id")) or {}
                r["week_start"] = r.get("week_start") or p.get("week_start") or r.get("created_at") or datetime.utcnow()
                r["week_end"] = r.get("week_end") or p.get("week_end") or r.get("created_at") or datetime.utcnow()
                st = str(r.get("status") or "pending").lower()
                if st not in ("pending", "approved", "rejected", "paid"):
                    st = "pending"
                r["status"] = st
            raw = [
                r
                for r in raw
                if r.get("agency_user_id") in user_ids and r.get("room_owner_id") in user_ids
            ]
            cols, data = copy_intersect(
                raw,
                [
                    "id", "period_id", "week_start", "week_end", "agency_user_id", "room_owner_id",
                    "suggested_gems", "approved_gems", "status", "notes", "paid_at", "created_at",
                ],
                defaults={"status": "pending", "suggested_gems": 0, "created_at": datetime.utcnow},
            )
            load("agency_weekly_distributions", cols, data, "agency_weekly_distributions")

        if table_exists(my_cur, "feedback"):
            raw = fetch_all(my_cur, "SELECT * FROM feedback")
            raw = [r for r in raw if r.get("user_id") in user_ids]
            cols, data = copy_intersect(
                raw,
                ["id", "user_id", "message", "created_at"],
                defaults={"created_at": datetime.utcnow, "message": ""},
            )
            load("feedback", cols, data, "feedback")

        # bonus claims from user_bonus_grants
        if table_exists(my_cur, "user_bonus_grants"):
            raw = fetch_all(my_cur, "SELECT * FROM user_bonus_grants")
            raw = [r for r in raw if r.get("user_id") in user_ids]
            rows = []
            for r in raw:
                rows.append(
                    (
                        r["id"],
                        r["user_id"],
                        str(r.get("bonus_type") or r.get("kind") or r.get("type") or "legacy")[:64],
                        int(r.get("coins") or r.get("coin_amount") or r.get("amount") or 0),
                        json.dumps({"legacy": {k: to_pg(v) if not isinstance(v, (dict, list)) else v for k, v in r.items()}}, default=str),
                        to_pg(r.get("created_at") or datetime.utcnow()),
                    )
                )
            load("bonus_claims", ["id", "user_id", "kind", "coins", "meta", "created_at"], rows, "user_bonus_grants")
            report["transforms"].append("user_bonus_grants→bonus_claims")

        if table_exists(my_cur, "user_unlocked_frames"):
            raw = fetch_all(my_cur, "SELECT * FROM user_unlocked_frames")
            raw = [r for r in raw if r.get("user_id") in user_ids and r.get("frame_id") in frame_ids]
            cols, data = copy_intersect(
                raw,
                ["id", "user_id", "frame_id", "coins_paid", "unlocked_at", "expires_at"],
                defaults={"coins_paid": 0, "unlocked_at": datetime.utcnow},
                coerce={"coins_paid": lambda v: int(v or 0)},
            )
            load("user_unlocked_frames", cols, data, "user_unlocked_frames")

        if table_exists(my_cur, "user_unlocked_stickers"):
            sticker_ids = {x["id"] for x in fetch_all(my_cur, "SELECT id FROM stickers")} if table_exists(my_cur, "stickers") else set()
            raw = fetch_all(my_cur, "SELECT * FROM user_unlocked_stickers")
            raw = [r for r in raw if r.get("user_id") in user_ids and r.get("sticker_id") in sticker_ids]
            cols, data = copy_intersect(
                raw,
                ["id", "user_id", "sticker_id", "coins_paid", "created_at"],
                defaults={"coins_paid": 0, "created_at": datetime.utcnow},
                coerce={"coins_paid": lambda v: int(v or 0)},
            )
            load("user_unlocked_stickers", cols, data, "user_unlocked_stickers")

        print("Resetting sequences...")
        reset_sequences(pg)
        pg.commit()

        # PG counts
        pg_counts = {}
        with pg.cursor() as cur:
            for t in TRUNCATE_ORDER:
                try:
                    pg_counts[t] = count_pg(cur, t)
                except Exception:
                    pg.rollback()
                    pg_counts[t] = -1
        report["postgres_counts"] = pg_counts

        out = REPORT_DIR / f"migration_report_{ts}.md"
        out.write_text("# Migration report\n\n```json\n" + json.dumps(report, indent=2, default=str) + "\n```\n")
        print(f"DONE. Report: {out}")
        return 0
    except Exception as e:
        pg.rollback()
        report["errors"].append(str(e))
        out = REPORT_DIR / f"migration_report_{ts}_FAILED.md"
        out.write_text("# FAILED migration\n\n" + json.dumps(report, indent=2, default=str) + "\n\n" + repr(e))
        print("FAILED:", e, file=sys.stderr)
        raise
    finally:
        my_cur.close()
        my.close()
        pg.close()


def run_sync() -> int:
    """Upsert catalog and insert missing Laravel users. Never truncates or deletes."""
    print("=== ChatAura sync (no deletes) ===")
    my = mysql_connect()
    pg = pg_connect()
    my_cur = my.cursor()
    try:
        mysql_users = count_mysql(my_cur, "users")
        if mysql_users <= 0:
            print("Refusing sync: Laravel returned 0 users.", file=sys.stderr)
            return 2

        def pg_count(table: str) -> int:
            with pg.cursor() as cur:
                return count_pg(cur, table)

        before = {
            "users": pg_count("users"),
            "gifts": pg_count("gifts"),
            "frames": pg_count("frames"),
            "stickers": pg_count("stickers"),
            "media_items": pg_count("media_items"),
        }
        with pg.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM frames WHERE category = 'role'")
            before["role_frames"] = int(cur.fetchone()[0])
        print("Nest before:", before)

        vg = fetch_all(my_cur, "SELECT * FROM virtual_gifts") if table_exists(my_cur, "virtual_gifts") else []
        # gift_types use synthetic ids and must not overwrite real gift rows.
        g_cols, g_rows = transform_gifts(vg, [])
        n_gifts = upsert_by_id(
            pg,
            "gifts",
            g_cols,
            g_rows,
            ["name", "coin_cost", "image_url", "animation_url", "is_active"],
        )
        pg.commit()
        print(f"  gifts upserted: {n_gifts}")

        f_cols, f_rows = transform_frames(fetch_all(my_cur, "SELECT * FROM frames"))
        n_frames = upsert_by_id(
            pg,
            "frames",
            f_cols,
            f_rows,
            [
                "name", "slug", "category", "level_required", "coin_cost",
                "is_premium", "is_active", "image_url", "animation_key",
            ],
        )
        pg.commit()
        print(f"  frames upserted: {n_frames}")

        raw_stickers = fetch_all(my_cur, "SELECT * FROM stickers") if table_exists(my_cur, "stickers") else []
        s_cols, s_rows = copy_intersect(
            raw_stickers,
            ["id", "name", "coin_cost", "image_url", "animation_url", "is_active", "created_at"],
            defaults={"coin_cost": 0, "is_active": True, "created_at": datetime.utcnow},
            coerce={
                "is_active": boolish,
                "coin_cost": lambda v: int(v or 0),
                "image_url": rewrite_media_url,
                "animation_url": rewrite_media_url,
            },
        )
        n_stickers = upsert_by_id(
            pg,
            "stickers",
            s_cols,
            s_rows,
            ["name", "coin_cost", "image_url", "animation_url", "is_active"],
        )
        pg.commit()
        print(f"  stickers upserted: {n_stickers}")

        with pg.cursor() as cur:
            cur.execute("SELECT id FROM frames")
            frame_ids = {int(r[0]) for r in cur.fetchall()}
            cur.execute("SELECT id FROM entry_bars")
            bar_ids = {int(r[0]) for r in cur.fetchall()}
            cur.execute("SELECT id, lower(email), phone, invite_code FROM users")
            taken_ids: set[int] = set()
            taken_emails: set[str] = set()
            taken_phones: set[str] = set()
            taken_invites: set[str] = set()
            for uid, email, phone, invite in cur.fetchall():
                taken_ids.add(int(uid))
                if email:
                    taken_emails.add(email)
                if phone:
                    taken_phones.add(str(phone))
                if invite:
                    taken_invites.add(str(invite))
            cur.execute("SELECT COALESCE(MAX(id), 0) FROM users")
            next_id = int(cur.fetchone()[0]) + 1

        u_cols, u_rows = transform_users(fetch_all(my_cur, "SELECT * FROM users"))
        idx = {name: i for i, name in enumerate(u_cols)}
        to_insert: list[tuple] = []
        skipped_email = 0
        remapped = 0
        for row in u_rows:
            values = list(row)
            email = values[idx["email"]]
            if email and str(email).lower() in taken_emails:
                skipped_email += 1
                continue
            uid = int(values[idx["id"]])
            if uid in taken_ids:
                values[idx["id"]] = next_id
                next_id += 1
                remapped += 1
            phone = values[idx["phone"]]
            if phone and str(phone) in taken_phones:
                values[idx["phone"]] = None
            elif phone:
                taken_phones.add(str(phone))
            invite = values[idx["invite_code"]]
            if invite and str(invite) in taken_invites:
                values[idx["invite_code"]] = None
            elif invite:
                taken_invites.add(str(invite))
            frame_id = values[idx["selected_frame_id"]]
            if frame_id is not None and int(frame_id) not in frame_ids:
                values[idx["selected_frame_id"]] = None
            bar_id = values[idx["selected_entry_bar_id"]]
            if bar_id is not None and int(bar_id) not in bar_ids:
                values[idx["selected_entry_bar_id"]] = None
            # Avoid FK failures when the referrer is not on Nest yet.
            values[idx["invited_by"]] = None
            taken_ids.add(int(values[idx["id"]]))
            if email:
                taken_emails.add(str(email).lower())
            to_insert.append(tuple(values))

        inserted = insert_batch(pg, "users", u_cols, to_insert)
        pg.commit()
        print(f"  users inserted: {inserted} skipped_existing_email: {skipped_email} remapped_id: {remapped}")

        # laravel_user_id → nest_user_id via email (covers skipped Nest-owned emails)
        with pg.cursor() as cur:
            cur.execute("SELECT id, lower(email) FROM users WHERE email IS NOT NULL")
            nest_by_email = {email: int(uid) for uid, email in cur.fetchall() if email}
            cur.execute("SELECT id FROM users")
            nest_user_ids = {int(r[0]) for r in cur.fetchall()}
        laravel_users = fetch_all(my_cur, "SELECT id, email FROM users")
        user_map: dict[int, int] = {}
        for u in laravel_users:
            lid = int(u["id"])
            email = (u.get("email") or "").strip().lower()
            if email and email in nest_by_email:
                user_map[lid] = nest_by_email[email]
            elif lid in nest_user_ids:
                user_map[lid] = lid

        # --- media posts / reels ---
        media_upserted = 0
        likes_n = comments_n = saves_n = 0
        if table_exists(my_cur, "media_posts"):
            raw_media = fetch_all(my_cur, "SELECT * FROM media_posts")
            kept = []
            for r in raw_media:
                lid = int(r["user_id"])
                nest_uid = user_map.get(lid)
                if nest_uid is None:
                    continue
                r = dict(r)
                r["user_id"] = nest_uid
                kept.append(r)
            m_cols, m_rows = transform_media_items(kept)
            media_upserted = upsert_by_id(
                pg,
                "media_items",
                m_cols,
                m_rows,
                [
                    "user_id", "kind", "media_type", "file_url", "thumbnail_url", "caption",
                    "music_url", "effect_name", "duration", "aspect_ratio", "is_camera_recorded",
                    "likes_count", "comments_count", "shares_count", "is_deleted", "updated_at",
                ],
            )
            pg.commit()
            media_ids = {int(r["id"]) for r in kept}
            print(f"  media_items upserted: {media_upserted} (skipped authors: {len(raw_media) - len(kept)})")

            if table_exists(my_cur, "post_likes"):
                likes = fetch_all(my_cur, "SELECT * FROM post_likes")
                like_rows = []
                seen_pairs: set[tuple[int, int]] = set()
                for r in likes:
                    mid = int(r["media_post_id"])
                    uid = user_map.get(int(r["user_id"]))
                    if mid not in media_ids or uid is None:
                        continue
                    pair = (mid, uid)
                    if pair in seen_pairs:
                        continue
                    seen_pairs.add(pair)
                    like_rows.append(
                        (
                            int(r["id"]),
                            mid,
                            uid,
                            to_pg(r.get("created_at") or datetime.utcnow()),
                        )
                    )
                likes_n = insert_ignore_unique(
                    pg,
                    "media_likes",
                    ["id", "media_id", "user_id", "created_at"],
                    like_rows,
                    "",  # any unique violation (id or media_id+user_id)
                )
                pg.commit()
                print(f"  media_likes inserted: {likes_n}")

            if table_exists(my_cur, "post_comments"):
                comments = fetch_all(my_cur, "SELECT * FROM post_comments")
                comment_rows = []
                for r in comments:
                    mid = int(r["media_post_id"])
                    uid = user_map.get(int(r["user_id"]))
                    if mid not in media_ids or uid is None:
                        continue
                    comment_rows.append(
                        (
                            int(r["id"]),
                            mid,
                            uid,
                            r.get("comment") or "",
                            to_pg(r.get("created_at") or datetime.utcnow()),
                        )
                    )
                comments_n = upsert_by_id(
                    pg,
                    "media_comments",
                    ["id", "media_id", "user_id", "comment", "created_at"],
                    comment_rows,
                    ["media_id", "user_id", "comment"],
                )
                pg.commit()
                print(f"  media_comments upserted: {comments_n}")

            if table_exists(my_cur, "post_saves"):
                saves = fetch_all(my_cur, "SELECT * FROM post_saves")
                save_rows = []
                seen_save: set[tuple[int, int]] = set()
                for r in saves:
                    mid = int(r["media_post_id"])
                    uid = user_map.get(int(r["user_id"]))
                    if mid not in media_ids or uid is None:
                        continue
                    pair = (mid, uid)
                    if pair in seen_save:
                        continue
                    seen_save.add(pair)
                    save_rows.append(
                        (
                            int(r["id"]),
                            mid,
                            uid,
                            to_pg(r.get("created_at") or datetime.utcnow()),
                        )
                    )
                saves_n = insert_ignore_unique(
                    pg,
                    "media_saves",
                    ["id", "media_id", "user_id", "created_at"],
                    save_rows,
                    "",  # any unique violation (id or media_id+user_id)
                )
                pg.commit()
                print(f"  media_saves inserted: {saves_n}")

        # --- role frames (Nest frames.category = role; slug-prefixed) ---
        role_n = 0
        if table_exists(my_cur, "role_frames"):
            rf_cols, rf_rows = transform_role_frames(fetch_all(my_cur, "SELECT * FROM role_frames"))
            role_n = upsert_by_slug(
                pg,
                "frames",
                rf_cols,
                rf_rows,
                [
                    "name", "category", "level_required", "coin_cost", "is_premium",
                    "is_active", "image_url", "animation_url", "animation_key", "composite_mode",
                ],
            )
            pg.commit()
            print(f"  role_frames upserted: {role_n}")

        reset_sequences(pg)
        pg.commit()

        with pg.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM media_items WHERE kind = 'post'")
            posts = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM media_items WHERE kind = 'reel'")
            reels = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM media_likes")
            likes_c = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM media_comments")
            comments_c = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM media_saves")
            saves_c = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM frames WHERE category = 'role'")
            role_c = int(cur.fetchone()[0])
            cur.execute("SELECT id, name FROM stickers WHERE lower(name)='lion'")
            lion = cur.fetchone()

        after = {
            "users": pg_count("users"),
            "gifts": pg_count("gifts"),
            "frames": pg_count("frames"),
            "stickers": pg_count("stickers"),
            "posts": posts,
            "reels": reels,
            "media_likes": likes_c,
            "media_comments": comments_c,
            "media_saves": saves_c,
            "role_frames": role_c,
        }
        print("Nest after:", after)
        print("sticker lion:", lion)
        return 0
    except Exception:
        pg.rollback()
        raise
    finally:
        my_cur.close()
        my.close()
        pg.close()


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--sync", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if args.apply and os.environ.get("ALLOW_DESTRUCTIVE_TRUNCATE") != "1":
        print(
            "TRUNCATE is disabled. Use --sync. "
            "Set ALLOW_DESTRUCTIVE_TRUNCATE=1 only for a deliberate wipe.",
            file=sys.stderr,
        )
        sys.exit(2)
    if args.sync:
        sys.exit(run_sync())
    sys.exit(run(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
