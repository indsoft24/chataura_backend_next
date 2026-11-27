#!/usr/bin/env bash
# Run on YOUR Mac. Asks for the R2 keys (hidden while typing) and saves them on the VPS in a root-only file.
# The keys never go through chat and are never printed.
set -euo pipefail

ACCOUNT_ID="77439afc1a5338db8405f58bf886ca7f"
BUCKET="ca-assets-fab3f76b211d"
REMOTE_FILE="/var/www/chataura_backend_next/.r2.env"

read -r -s -p "R2 Access Key ID: " KEY_ID; echo
read -r -s -p "R2 Secret Access Key: " SECRET; echo

[ -n "$KEY_ID" ] && [ -n "$SECRET" ] || { echo "empty value, nothing saved"; exit 1; }

printf 'R2_ACCOUNT_ID=%s\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\nR2_BUCKET=%s\n' \
  "$ACCOUNT_ID" "$KEY_ID" "$SECRET" "$BUCKET" \
  | ssh chataura-vps "umask 077 && cat > $REMOTE_FILE && chmod 600 $REMOTE_FILE && echo saved: \$(stat -c '%a %U' $REMOTE_FILE) \$(wc -l < $REMOTE_FILE) lines"

unset KEY_ID SECRET
echo "Done. Tell Claude: r2 keys saved."
