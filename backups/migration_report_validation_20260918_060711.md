# Validation report

```json
{
  "timestamp": "2026-09-18T06:07:11.095904Z",
  "checks": {},
  "counts": [
    {
      "mysql": "users",
      "pg": "users",
      "mysql_count": 690,
      "pg_count": 691,
      "ok": false
    },
    {
      "mysql": "coin_packages",
      "pg": "coin_packages",
      "mysql_count": 18,
      "pg_count": 18,
      "ok": true
    },
    {
      "mysql": "frames",
      "pg": "frames",
      "mysql_count": 88,
      "pg_count": 88,
      "ok": true
    },
    {
      "mysql": "messages",
      "pg": "messages",
      "mysql_count": 3968,
      "pg_count": 3968,
      "ok": true
    },
    {
      "mysql": "conversations",
      "pg": "conversations",
      "mysql_count": 853,
      "pg_count": 853,
      "ok": true
    },
    {
      "mysql": "media_posts",
      "pg": "media_items",
      "mysql_count": 72,
      "pg_count": 72,
      "ok": true
    },
    {
      "mysql": "virtual_gifts",
      "pg": "gifts",
      "mysql_count": 25,
      "pg_count": 25,
      "ok": true
    },
    {
      "mysql": "gem_conversions",
      "pg": "gem_conversions",
      "mysql_count": 24,
      "pg_count": 24,
      "ok": true
    }
  ],
  "balance_spots": [
    {
      "id": 1012,
      "mysql": {
        "coins": 63124939,
        "gems": 1310
      },
      "pg": {
        "coins": 63124939,
        "gems": 1310
      },
      "match": true
    },
    {
      "id": 853,
      "mysql": {
        "coins": 23449922,
        "gems": 0
      },
      "pg": {
        "coins": 23449922,
        "gems": 0
      },
      "match": true
    },
    {
      "id": 868,
      "mysql": {
        "coins": 15881597,
        "gems": 0
      },
      "pg": {
        "coins": 15881597,
        "gems": 0
      },
      "match": true
    },
    {
      "id": 1072,
      "mysql": {
        "coins": 10041500,
        "gems": 75526
      },
      "pg": {
        "coins": 10041500,
        "gems": 75526
      },
      "match": true
    },
    {
      "id": 910,
      "mysql": {
        "coins": 4347643,
        "gems": 4510
      },
      "pg": {
        "coins": 4347643,
        "gems": 4510
      },
      "match": true
    }
  ],
  "laravel_env_exists": true,
  "laravel_firebase_exists": true,
  "laravel_gcs_key_exists": true,
  "nest_secrets": {
    "firebase": true,
    "gcs": true
  }
}
```
