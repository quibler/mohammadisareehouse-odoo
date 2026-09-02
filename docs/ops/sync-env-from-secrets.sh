#!/usr/bin/env bash
# Render /opt/odoo/.env from AWS Secrets Manager.
#
# All Odoo credentials (Postgres password, admin web login, master password)
# live in one secret: odoo/prod/credentials. The EC2 instance reads it through
# its attached IAM role (odoo-ec2-backup-role) — no AWS keys on the box.
#
# Run this BEFORE `docker compose up`. Compose reads .env only when it CREATES
# a container, so a running stack keeps its existing values until the next
# recreate; `docker compose restart` will NOT pick up a rotated password.
set -euo pipefail

REGION="ap-south-1"
SECRET_ID="odoo/prod/credentials"
ENV_FILE="/opt/odoo/.env"

SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" \
  --region "$REGION" --query SecretString --output text)"

PG_PASS="$(printf '%s' "$SECRET_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["POSTGRES_PASSWORD"])')"
ADMIN_PASS="$(printf '%s' "$SECRET_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ODOO_ADMIN_USER_PASSWORD",""))')"
MASTER_PASS="$(printf '%s' "$SECRET_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ODOO_MASTER_PASSWORD",""))')"

if [ -z "$PG_PASS" ]; then
  echo "ERROR: empty POSTGRES_PASSWORD in $SECRET_ID — refusing to write .env" >&2
  exit 1
fi

umask 077
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<EOF
# Generated from AWS Secrets Manager ($SECRET_ID) — do not edit by hand.
# Change the value in Secrets Manager, then re-run sync-env-from-secrets.sh
# and recreate containers with: docker compose up -d

# --- consumed by docker compose ---
POSTGRES_DB=odoo
POSTGRES_USER=odoo
POSTGRES_PASSWORD=${PG_PASS}

HOST=db
USER=odoo
PASSWORD=${PG_PASS}

# --- reference only (not used by compose) ---
ODOO_ADMIN_USER_PASSWORD=${ADMIN_PASS}
ODOO_MASTER_PASSWORD=${MASTER_PASS}
EOF

install -m 600 "$TMP" "$ENV_FILE"
echo "wrote ${ENV_FILE} from Secrets Manager (mode 600)"
