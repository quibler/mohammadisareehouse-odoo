#!/usr/bin/env bash
# Render /opt/odoo/.env from AWS SSM Parameter Store.
#
# Credentials live in Parameter Store under /odoo/prod/* as SecureString
# (Standard tier, so no per-secret monthly charge). The EC2 instance reads them
# through its attached IAM role (odoo-ec2-backup-role) — no AWS keys on the box.
#
# Run this BEFORE `docker compose up`. Compose reads .env only when it CREATES
# a container, so a running stack keeps its existing values until the next
# recreate; `docker compose restart` will NOT pick up a rotated password.
set -euo pipefail

REGION="ap-south-1"
ENV_FILE="/opt/odoo/.env"

get_param() {
  aws ssm get-parameter --name "/odoo/prod/$1" \
    --with-decryption --region "$REGION" --query Parameter.Value --output text
}

PG_PASS="$(get_param db_password)"
ADMIN_PASS="$(get_param admin_user_password)"
MASTER_PASS="$(get_param master_password)"

if [ -z "$PG_PASS" ] || [ "$PG_PASS" = "None" ]; then
  echo "ERROR: empty db_password from Parameter Store — refusing to write .env" >&2
  exit 1
fi

umask 077
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<EOF
# Generated from AWS SSM Parameter Store (/odoo/prod/*) — do not edit by hand.
# Change the value in Parameter Store, then re-run sync-env-from-secrets.sh
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
echo "wrote ${ENV_FILE} from SSM Parameter Store (mode 600)"
