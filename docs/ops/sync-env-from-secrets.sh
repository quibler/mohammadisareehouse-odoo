#!/usr/bin/env bash
# Render /opt/odoo/.env from AWS Secrets Manager.
#
# Secrets live in Secrets Manager (secret: odoo/prod/credentials) rather than
# being typed into files by hand. The EC2 instance reads them via its attached
# IAM role (odoo-ec2-backup-role), so no AWS keys are stored on the box.
#
# Run this BEFORE `docker compose up` -- Compose reads .env only when it
# creates a container, so a running stack keeps its existing values until the
# next recreate.
set -euo pipefail

SECRET_ID="odoo/prod/credentials"
REGION="ap-south-1"
ENV_FILE="/opt/odoo/.env"

SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" --region "$REGION" \
  --query SecretString --output text)"

PG_PASS="$(printf '%s' "$SECRET_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["POSTGRES_PASSWORD"])')"

if [ -z "$PG_PASS" ]; then
  echo "ERROR: empty POSTGRES_PASSWORD from Secrets Manager — refusing to write .env" >&2
  exit 1
fi

umask 077
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<EOF
# Generated from AWS Secrets Manager ($SECRET_ID) — do not edit by hand.
# Change the value in Secrets Manager, then re-run sync-env-from-secrets.sh.
POSTGRES_DB=odoo
POSTGRES_USER=odoo
POSTGRES_PASSWORD=${PG_PASS}

HOST=db
USER=odoo
PASSWORD=${PG_PASS}
EOF

install -m 600 "$TMP" "$ENV_FILE"
echo "wrote ${ENV_FILE} from Secrets Manager (mode 600)"
