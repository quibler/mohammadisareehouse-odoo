#!/usr/bin/env bash
#
# Restore an Odoo backup from the cross-region S3 bucket.
#
# Uses Odoo's own `odoo db load`, so Odoo rebuilds the database and filestore
# itself — including regenerating web assets, which a raw pg_restore leaves
# stale (that is what makes a hand-rolled restore render with broken styling).
#
#   ./restore-from-s3.sh --list
#   ./restore-from-s3.sh --latest --target-db test_upgrade      # neutralized copy
#   ./restore-from-s3.sh --latest --target-db prod --production # real recovery
#
# By default the restored database is NEUTRALIZED: scheduled actions are
# disabled and outgoing mail is pointed at a dead SMTP host, so a copy of
# production cannot email real customers or fire crons. Pass --production only
# when genuinely recovering the live system.
set -euo pipefail

BUCKET="s3://mdsaree-odoo-backups-dr"
SOURCE_DB="prod"
TARGET_DB=""
STAMP=""
WEB_CONTAINER=""
PROFILE="${AWS_PROFILE:-}"
NEUTRALIZE=1
ASSUME_YES=0
DO_LIST=0

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$RST" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

usage() {
  cat <<EOF
Restore an Odoo backup from S3 using Odoo's native loader.

  --list                 Show available backups and exit
  --latest               Use the most recent backup
  --stamp STAMP          Use a specific backup (e.g. 2026-08-30_0600)
  --target-db NAME       Database to restore into (required)
  --production           Do NOT neutralize — only for real recovery of the live system
  --web-container NAME   Odoo container (default: auto-detect)
  --profile NAME         AWS CLI profile (not needed on the EC2 host)
  --yes                  Skip the confirmation prompt
  -h, --help             This help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --list) DO_LIST=1 ;;
    --latest) STAMP="latest" ;;
    --stamp) STAMP="${2:?--stamp needs a value}"; shift ;;
    --target-db) TARGET_DB="${2:?}"; shift ;;
    --production) NEUTRALIZE=0 ;;
    --web-container) WEB_CONTAINER="${2:?}"; shift ;;
    --profile) PROFILE="${2:?}"; shift ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

AWSQ=(aws); [ -n "$PROFILE" ] && AWSQ+=(--profile "$PROFILE")
command -v aws    >/dev/null || die "aws CLI not found"
command -v docker >/dev/null || die "docker not found"

if [ "$DO_LIST" = 1 ]; then
  printf '%sAvailable backups:%s\n' "$BLD" "$RST"
  "${AWSQ[@]}" s3 ls "$BUCKET/odoo/" --human-readable \
    | awk '{printf "  %s %s  %8s %s  %s\n", $1, $2, $3, $4, $5}'
  exit 0
fi

[ -n "$STAMP" ]     || die "choose a backup: --latest, --stamp STAMP, or --list"
[ -n "$TARGET_DB" ] || die "--target-db is required (never guess where to restore)"

if [ "$STAMP" = "latest" ]; then
  STAMP="$("${AWSQ[@]}" s3 ls "$BUCKET/odoo/" | awk '{print $4}' \
    | sed -n "s/^${SOURCE_DB}_\(.*\)\.zip$/\1/p" | sort | tail -1)"
  [ -n "$STAMP" ] || die "no backups found in $BUCKET/odoo/"
fi
ok "backup: ${SOURCE_DB}_${STAMP}.zip"

if [ -z "$WEB_CONTAINER" ]; then
  WEB_CONTAINER="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' '$2 ~ /odoo/ {print $1; exit}')"
fi
[ -n "$WEB_CONTAINER" ] || die "no running Odoo container found (use --web-container)"
docker inspect "$WEB_CONTAINER" >/dev/null 2>&1 || die "container not found: $WEB_CONTAINER"
ok "odoo container: $WEB_CONTAINER"

# Credentials stay inside the container. Every command below expands $HOST,
# $USER and $PASSWORD in a shell running IN the container (note the single
# quotes), so the password never reaches the host's process list.
docker exec "$WEB_CONTAINER" sh -c '[ -n "$PASSWORD" ]' \
  || die "no DB password in $WEB_CONTAINER environment"

echo
printf '%sAbout to restore%s\n' "$BLD" "$RST"
printf '  backup        : %s @ %s\n' "$SOURCE_DB" "$STAMP"
printf '  into database : %s%s%s  (dropped and recreated)\n' "$BLD" "$TARGET_DB" "$RST"
if [ "$NEUTRALIZE" = 1 ]; then
  printf '  mode          : neutralized copy (crons off, outgoing mail disabled)\n'
else
  printf '  mode          : %sPRODUCTION — crons and outgoing mail stay LIVE%s\n' "$RED" "$RST"
fi
echo

if [ "$ASSUME_YES" != 1 ]; then
  printf 'Type the target database name to confirm: '
  read -r CONFIRM
  [ "$CONFIRM" = "$TARGET_DB" ] || die "aborted (got '$CONFIRM')"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; docker exec "$WEB_CONTAINER" rm -f "/tmp/${SOURCE_DB}_${STAMP}.zip" 2>/dev/null || true' EXIT
ARCHIVE="$TMP/${SOURCE_DB}_${STAMP}.zip"

ok "downloading..."
"${AWSQ[@]}" s3 cp "$BUCKET/odoo/${SOURCE_DB}_${STAMP}.zip" "$ARCHIVE" --only-show-errors \
  || die "could not download backup '$STAMP'"

# Verify before destroying anything.
python3 - "$ARCHIVE" <<'PY' || exit 1
import sys, zipfile, json
try:
    z = zipfile.ZipFile(sys.argv[1])
except zipfile.BadZipFile:
    sys.exit("archive is not a valid zip")
if z.testzip() is not None:
    sys.exit("archive has a corrupt member")
names = z.namelist()
if "dump.sql" not in names or not any(n.startswith("filestore/") for n in names):
    sys.exit("archive is missing dump.sql or filestore")
m = json.loads(z.read("manifest.json"))
print(f"  verified: db={m['db_name']} version={m['version']} modules={len(m.get('modules', {}))}")
PY
ok "archive verified — safe to proceed"

docker cp "$ARCHIVE" "$WEB_CONTAINER:/tmp/${SOURCE_DB}_${STAMP}.zip" >/dev/null

ok "restoring with odoo db load..."
LOAD_ARGS=(-f)
[ "$NEUTRALIZE" = 1 ] && LOAD_ARGS+=(-n)
docker exec "$WEB_CONTAINER" sh -c '
  exec odoo db -c /etc/odoo/odoo.conf \
    --db_host "$HOST" --db_port 5432 -r "$USER" -w "$PASSWORD" \
    load "$@"
' _ "${LOAD_ARGS[@]}" "$TARGET_DB" "/tmp/${SOURCE_DB}_${STAMP}.zip" \
  || die "odoo db load failed — $TARGET_DB may be incomplete"

# ------------------------------------------------------------------ verify
psql_q() {
  docker exec "$WEB_CONTAINER" sh -c '
    PGPASSWORD="$PASSWORD" psql -h "$HOST" -U "$USER" -d "$1" -tAc "$2"
  ' _ "$TARGET_DB" "$1" 2>/dev/null || echo '?'
}

echo
printf '%sVerification%s\n' "$BLD" "$RST"
printf '  %-18s %s\n' "POS orders"      "$(psql_q 'SELECT count(*) FROM pos_order')"
printf '  %-18s %s\n' "Journal entries" "$(psql_q 'SELECT count(*) FROM account_move')"
printf '  %-18s %s\n' "Products"        "$(psql_q 'SELECT count(*) FROM product_product')"
printf '  %-18s %s\n' "Users"           "$(psql_q 'SELECT count(*) FROM res_users')"
printf '  %-18s %s\n' "Active crons"    "$(psql_q "SELECT count(*) FILTER (WHERE active) || ' of ' || count(*) FROM ir_cron")"
printf '  %-18s %s\n' "Neutralized"     "$(psql_q "SELECT coalesce((SELECT value FROM ir_config_parameter WHERE key='database.is_neutralized'),'false')")"

echo
ok "restore complete: ${BLD}${TARGET_DB}${RST}"
if [ "$NEUTRALIZE" = 1 ]; then
  echo "  Crons are disabled and outgoing mail points at a dead SMTP host."
else
  warn "This database is LIVE — crons run and mail will be sent."
fi
echo
echo "If odoo.conf pins dbfilter to another database, widen it before this one will serve:"
echo "  dbfilter = ^(prod|test_.*)\$"
