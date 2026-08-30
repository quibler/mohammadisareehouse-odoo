#!/usr/bin/env bash
#
# Nightly Odoo backup to the cross-region S3 bucket.
#
# Uses Odoo's own `odoo db dump`, which produces the standard Odoo zip
# (dump.sql + filestore/ + manifest.json) — the same format the Odoo web UI
# produces and consumes. That keeps Odoo responsible for its own invariants
# instead of us reassembling a database and filestore by hand.
#
# Run on the EC2 host. Scheduled by odoo-backup.timer at 02:00 UTC.
set -euo pipefail

DB="prod"                                  # the only database that holds business data
S3_BUCKET="s3://mdsaree-odoo-backups-dr"   # different region to the instance
WEB_CONTAINER="odoo-web-1"
STAMP="$(date +%F_%H%M)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/${DB}_${STAMP}.zip"

# `odoo db` runs via `docker exec`, which bypasses the image entrypoint, so the
# DB connection has to be passed explicitly. The single quotes matter: $HOST,
# $USER and $PASSWORD are expanded by the shell INSIDE the container, using the
# environment Compose already gave it. If they were expanded here instead, the
# password would appear in the host's process list on every nightly run.
echo "Dumping ${DB}..."
docker exec "$WEB_CONTAINER" sh -c '
  [ -n "$PASSWORD" ] || { echo "ERROR: no DB password in container environment" >&2; exit 1; }
  exec odoo db -c /etc/odoo/odoo.conf \
    --db_host "$HOST" --db_port 5432 -r "$USER" -w "$PASSWORD" \
    dump '"$DB"' -
' > "$ARCHIVE"

# Never upload an archive we have not opened. Checks the zip is intact and
# contains all three parts a real Odoo backup must have.
python3 - "$ARCHIVE" <<'PY'
import sys, zipfile, json
path = sys.argv[1]
try:
    z = zipfile.ZipFile(path)
except zipfile.BadZipFile:
    sys.exit("ERROR: archive is not a valid zip — aborting")
if z.testzip() is not None:
    sys.exit("ERROR: archive has a corrupt member — aborting")
names = z.namelist()
if "dump.sql" not in names:
    sys.exit("ERROR: archive has no dump.sql — aborting")
if not any(n.startswith("filestore/") for n in names):
    sys.exit("ERROR: archive has no filestore — aborting")
m = json.loads(z.read("manifest.json"))
print(f"  verified: db={m['db_name']} version={m['version']} "
      f"modules={len(m.get('modules', {}))} entries={len(names)}")
PY

echo "Uploading..."
aws s3 cp "$ARCHIVE" "$S3_BUCKET/odoo/${DB}_${STAMP}.zip" --sse AES256 --only-show-errors

# Old backups are removed by the bucket's 30-day lifecycle rule.
echo "Backup complete: ${DB}_${STAMP}.zip ($(du -h "$ARCHIVE" | cut -f1))"
