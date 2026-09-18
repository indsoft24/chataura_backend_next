# FAILED migration

{
  "mode": "apply",
  "timestamp": "20260918_060151",
  "tables": {
    "admin_settings": {
      "mysql_source": "admin_settings",
      "mysql_count": 1,
      "inserted": 1,
      "extra": null
    },
    "levels": {
      "mysql_source": "levels",
      "mysql_count": 12,
      "inserted": 12,
      "extra": null
    },
    "frames": {
      "mysql_source": "frames",
      "mysql_count": 88,
      "inserted": 88,
      "extra": null
    },
    "entry_bars": {
      "mysql_source": "entry_bars",
      "mysql_count": 10,
      "inserted": 10,
      "extra": null
    },
    "room_themes": {
      "mysql_source": "room_themes",
      "mysql_count": 18,
      "inserted": 18,
      "extra": null
    },
    "stickers": {
      "mysql_source": "stickers",
      "mysql_count": 14,
      "inserted": 14,
      "extra": null
    },
    "banners": {
      "mysql_source": "banners",
      "mysql_count": 5,
      "inserted": 5,
      "extra": null
    },
    "faq_items": {
      "mysql_source": "faq_items",
      "mysql_count": 3,
      "inserted": 3,
      "extra": null
    },
    "coin_packages": {
      "mysql_source": "coin_packages",
      "mysql_count": 18,
      "inserted": 18,
      "extra": null
    },
    "gifts": {
      "mysql_source": "virtual_gifts",
      "mysql_count": 25,
      "inserted": 25,
      "extra": {
        "gift_types_merged": 6
      }
    },
    "users": {
      "mysql_source": "users",
      "mysql_count": 690,
      "inserted": 690,
      "extra": null
    },
    "refresh_tokens": {
      "mysql_source": "refresh_tokens",
      "mysql_count": 9637,
      "inserted": 9637,
      "extra": {
        "filtered_from": 9637
      }
    },
    "user_devices": {
      "mysql_source": "user_devices",
      "mysql_count": 638,
      "inserted": 638,
      "extra": {
        "filtered_from": 638
      }
    },
    "user_followers": {
      "mysql_source": "user_followers",
      "mysql_count": 324,
      "inserted": 324,
      "extra": {
        "filtered_from": 324
      }
    },
    "friendships": {
      "mysql_source": "friendships",
      "mysql_count": 372,
      "inserted": 372,
      "extra": {
        "filtered_from": 372
      }
    },
    "friend_requests": {
      "mysql_source": "friend_requests",
      "mysql_count": 277,
      "inserted": 277,
      "extra": {
        "filtered_from": 277
      }
    },
    "blocked_users": {
      "mysql_source": "blocked_users",
      "mysql_count": 2,
      "inserted": 2,
      "extra": {
        "filtered_from": 2
      }
    },
    "user_reports": {
      "mysql_source": "user_reports",
      "mysql_count": 7,
      "inserted": 7,
      "extra": {
        "filtered_from": 7
      }
    },
    "coin_purchase_transactions": {
      "mysql_source": "coin_purchase_transactions",
      "mysql_count": 195,
      "inserted": 189,
      "extra": null
    },
    "coin_transactions": {
      "mysql_source": "coin_transactions",
      "mysql_count": 6381,
      "inserted": 12278,
      "extra": {
        "source": 6381,
        "emitted": 12278,
        "skipped_no_party": 2
      }
    },
    "gem_conversions": {
      "mysql_source": "gem_conversions",
      "mysql_count": 24,
      "inserted": 24,
      "extra": null
    },
    "withdrawal_requests": {
      "mysql_source": "withdrawal_requests",
      "mysql_count": 0,
      "inserted": 0,
      "extra": null
    },
    "rooms": {
      "mysql_source": "rooms",
      "mysql_count": 1655,
      "inserted": 1340,
      "extra": null
    }
  },
  "skipped_mysql": [
    "admin_staff",
    "agency_weekly_periods",
    "cache",
    "cache_locks",
    "call_logs",
    "call_sessions",
    "calls",
    "chat_groups",
    "countries",
    "failed_jobs",
    "gift_types",
    "group_members",
    "job_batches",
    "jobs",
    "languages",
    "level_economy_configs",
    "level_reward_maps",
    "migrations",
    "nameplates",
    "party_room_bonus_tiers",
    "password_reset_tokens",
    "referral_history",
    "role_frames",
    "room_gift_cashback_progress",
    "sessions",
    "staff_commission_ledgers",
    "staff_role_transitions",
    "transactions",
    "user_report_logs",
    "user_room_presence_sessions",
    "wallet_packages",
    "wallet_transactions",
    "wealth_privileges",
    "xp_sources"
  ],
  "transforms": [
    "virtual_gifts+gift_types\u2192gifts",
    "coin_transactions 1\u2192N ledger"
  ],
  "errors": [
    "duplicate key value violates unique constraint \"room_members_room_id_user_id_key\"\nDETAIL:  Key (room_id, user_id)=(019de4d7-aca7-72ab-acd2-0311e39265b1, 139) already exists.\n"
  ],
  "mysql_counts": {
    "users": 690,
    "coin_packages": 18,
    "virtual_gifts": 25,
    "gift_types": 6,
    "coin_transactions": 6381,
    "coin_purchase_transactions": 195,
    "admin_settings": 1,
    "levels": 12,
    "frames": 88,
    "entry_bars": 10,
    "room_themes": 18,
    "stickers": 14,
    "banners": 5,
    "music_tracks": 0,
    "faq_items": 3,
    "rooms": 1655,
    "room_members": 2707,
    "seats": 15641,
    "room_blocks": 4,
    "refresh_tokens": 9637,
    "user_devices": 638,
    "user_followers": 324,
    "friendships": 372,
    "friend_requests": 277,
    "blocked_users": 2,
    "user_reports": 7,
    "gem_conversions": 24,
    "withdrawal_requests": 0,
    "conversations": 853,
    "conversation_participants": 1308,
    "messages": 3968,
    "star_chat_sessions": 88,
    "greedy_rounds": 929,
    "greedy_bets": 3490,
    "lucky77_rounds": 262,
    "lucky77_bets": 315,
    "media_posts": 72,
    "post_likes": 431,
    "post_comments": 42,
    "post_saves": 5,
    "user_unlocked_frames": 1029,
    "user_unlocked_stickers": 17,
    "agency_affiliations": 7,
    "agency_weekly_distributions": 22,
    "feedback": 6,
    "user_bonus_grants": 3099
  },
  "pg_id_types": {
    "stickers": "bigint",
    "rooms": "uuid",
    "agency_affiliations": "bigint",
    "user_unlocked_stickers": "bigint",
    "bonus_claims": "bigint",
    "agency_weekly_distributions": "bigint",
    "coin_transactions": "bigint",
    "coin_purchase_transactions": "bigint",
    "user_reports": "bigint",
    "friendships": "bigint",
    "user_unlocked_frames": "bigint",
    "user_followers": "bigint",
    "user_devices": "bigint",
    "gem_conversions": "bigint",
    "withdrawal_requests": "bigint",
    "feedback": "bigint",
    "refresh_tokens": "uuid",
    "users": "bigint",
    "blocked_users": "bigint",
    "friend_requests": "bigint",
    "music_tracks": "bigint",
    "faq_items": "bigint",
    "media_saves": "bigint",
    "media_likes": "bigint",
    "media_comments": "bigint",
    "media_items": "bigint",
    "lucky77_bets": "bigint",
    "lucky77_rounds": "bigint",
    "greedy_bets": "bigint",
    "greedy_rounds": "bigint",
    "star_chat_sessions": "bigint",
    "admin_settings": "integer",
    "gifts": "bigint",
    "coin_packages": "bigint",
    "levels": "integer",
    "frames": "bigint",
    "entry_bars": "bigint",
    "room_themes": "bigint",
    "banners": "bigint",
    "messages": "bigint",
    "conversation_participants": "bigint",
    "conversations": "bigint",
    "seats": "bigint",
    "room_blocks": "bigint",
    "room_members": "bigint",
    "_prisma_migrations": "character varying"
  }
}

UniqueViolation('duplicate key value violates unique constraint "room_members_room_id_user_id_key"\nDETAIL:  Key (room_id, user_id)=(019de4d7-aca7-72ab-acd2-0311e39265b1, 139) already exists.\n')