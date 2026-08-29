#!/usr/bin/env bash
# Nightly logical backup: Postgres dumps + filestore -> S3 bucket in a DIFFERENT
# region than the EC2 instance (bare-minimum cross-region protection).
#
# Backs up EVERY non-template database (prod, testing, odoo, ...) so nothing is
# missed, plus the shared filestore. Run on the EC2 host, NOT inside a container.
#   0 2 * * * /opt/odoo-data/backup-to-s3.sh >> /var/log/odoo-backup.log 2>&1
set -euo pipefail

COMPOSE_DIR="/opt/odoo"                       # dir with docker-compose.yml
FILESTORE_DIR="/opt/odoo-data/filestore"
S3_BUCKET="s3://mdsaree-odoo-backups-dr"      # bucket lives in a different region than this instance
# No --profile: the instance authenticates via its attached IAM role (odoo-ec2-backup-role).
DATE="$(date +%F_%H%M)"
TMP_DIR="$(mktemp -d)"
DB_USER="odoo"
DB_CONTAINER="odoo-db-1"

trap 'rm -rf "$TMP_DIR"' EXIT

cd "$COMPOSE_DIR"

# Discover databases rather than hardcoding one — production is 'prod', not 'odoo'.
DATABASES=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -tAc \
  "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres';")

if [ -z "$DATABASES" ]; then
  echo "ERROR: no databases discovered — aborting so a bad backup is not uploaded." >&2
  exit 1
fi

# 1. Dump each database (compressed custom format, restorable with pg_restore).
#    nice/ionice keeps this gentle on the live POS workload.
for db in $DATABASES; do
  echo "Dumping ${db}..."
  # No -t: a TTY would corrupt the binary dump stream.
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$db" > "$TMP_DIR/${db}_${DATE}.dump"

  # Fail loudly if the dump is unreadable — never upload a corrupt backup silently.
  if ! pg_restore --list "$TMP_DIR/${db}_${DATE}.dump" >/dev/null 2>&1; then
    if ! docker exec -i "$DB_CONTAINER" pg_restore --list < "$TMP_DIR/${db}_${DATE}.dump" >/dev/null 2>&1; then
      echo "ERROR: dump for ${db} failed verification — aborting." >&2
      exit 1
    fi
  fi
done

# 2. Filestore (attachments, images) — covers every database's filestore subdir.
nice -n 10 ionice -c2 -n7 tar -czf "$TMP_DIR/filestore_${DATE}.tar.gz" -C "$FILESTORE_DIR" .

# 3. Upload to the cross-region bucket (server-side encrypted).
for db in $DATABASES; do
  aws s3 cp "$TMP_DIR/${db}_${DATE}.dump" "$S3_BUCKET/postgres/${db}/${db}_${DATE}.dump" --sse AES256 --only-show-errors
done
aws s3 cp "$TMP_DIR/filestore_${DATE}.tar.gz" "$S3_BUCKET/filestore/filestore_${DATE}.tar.gz" --sse AES256 --only-show-errors

# Old backups are auto-deleted by the bucket's 30-day lifecycle rule (s3-lifecycle.json).

echo "Backup complete: ${DATE} (databases: $(echo $DATABASES | tr '\n' ' '))"
