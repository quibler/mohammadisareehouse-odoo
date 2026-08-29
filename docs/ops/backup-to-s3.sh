#!/usr/bin/env bash
# Nightly logical backup: Postgres dump + filestore -> S3 bucket in a DIFFERENT
# region than the EC2 instance (bare-minimum cross-region protection).
# Run on the EC2 host (not in a container). Add to root's crontab, e.g.:
#   0 2 * * * /opt/odoo-data/backup-to-s3.sh >> /var/log/odoo-backup.log 2>&1
set -euo pipefail

COMPOSE_DIR="/opt/odoo"   # dir with docker-compose.yml
FILESTORE_DIR="/opt/odoo-data/filestore"
S3_BUCKET="s3://mdsaree-odoo-backups-dr"              # bucket lives in a different region than the EC2 instance
# No --profile: the EC2 instance authenticates via its attached IAM role (odoo-ec2-backup-role).
DATE="$(date +%F_%H%M)"
TMP_DIR="$(mktemp -d)"
DB_NAME="odoo"
DB_USER="odoo"

trap 'rm -rf "$TMP_DIR"' EXIT

cd "$COMPOSE_DIR"

# 1. Postgres dump (compressed custom format, restorable with pg_restore)
docker compose exec -T db pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$TMP_DIR/db_${DATE}.dump"

# 2. Filestore (attachments, images, etc.)
tar -czf "$TMP_DIR/filestore_${DATE}.tar.gz" -C "$FILESTORE_DIR" .

# 3. Upload directly to the cross-region bucket (server-side encrypted)
aws s3 cp "$TMP_DIR/db_${DATE}.dump" "$S3_BUCKET/postgres/db_${DATE}.dump" --sse AES256
aws s3 cp "$TMP_DIR/filestore_${DATE}.tar.gz" "$S3_BUCKET/filestore/filestore_${DATE}.tar.gz" --sse AES256

# Old backups are auto-deleted by the bucket's lifecycle rule (see s3-lifecycle.json) — no pruning here.

echo "Backup complete: ${DATE}"
