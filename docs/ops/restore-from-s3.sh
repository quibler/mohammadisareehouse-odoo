#!/usr/bin/env bash
#
# Restore an Odoo backup from the cross-region S3 bucket.
#
# Designed for an emergency: it downloads a chosen backup, verifies it, restores
# the database, and puts the filestore where Odoo expects it. Works on the EC2
# host and on a laptop running the stack in Docker.
#
#   ./restore-from-s3.sh --list
#   ./restore-from-s3.sh --latest --target-db restore_test
#   ./restore-from-s3.sh --stamp 2026-08-29_1912 --target-db restore_test
#
# Restoring OVER a database that Odoo is serving requires --yes and typing the
# database name, because it drops the existing database first.
#
# On a laptop you will need --profile (or AWS_PROFILE). On the EC2 host the
# instance IAM role is used automatically, so no profile is needed.
set -euo pipefail

BUCKET="s3://mdsaree-odoo-backups-dr"
SOURCE_DB="prod"          # which database's dump to pull
TARGET_DB="restore_test"  # database to create locally
STAMP=""
DB_CONTAINER=""
WEB_CONTAINER=""
PROFILE="${AWS_PROFILE:-}"
ASSUME_YES=0
SKIP_FILESTORE=0
DO_LIST=0

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$RST" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  cat <<EOF

Options:
  --list                 Show available backups in S3 and exit
  --latest               Use the most recent backup
  --stamp STAMP          Use a specific backup (e.g. 2026-08-29_1912)
  --source-db NAME       Which database's dump to restore (default: $SOURCE_DB)
  --target-db NAME       Database to restore into (default: $TARGET_DB)
  --db-container NAME    Postgres container (default: auto-detect)
  --web-container NAME   Odoo container, used to locate the filestore (default: auto-detect)
  --profile NAME         AWS CLI profile (not needed on the EC2 host)
  --skip-filestore       Restore the database only
  --yes                  Do not prompt (still requires care when overwriting)
  -h, --help             This help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --list) DO_LIST=1 ;;
    --latest) STAMP="latest" ;;
    --stamp) STAMP="${2:?--stamp needs a value}"; shift ;;
    --source-db) SOURCE_DB="${2:?}"; shift ;;
    --target-db) TARGET_DB="${2:?}"; shift ;;
    --db-container) DB_CONTAINER="${2:?}"; shift ;;
    --web-container) WEB_CONTAINER="${2:?}"; shift ;;
    --profile) PROFILE="${2:?}"; shift ;;
    --skip-filestore) SKIP_FILESTORE=1 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

AWSQ=(aws)
[ -n "$PROFILE" ] && AWSQ+=(--profile "$PROFILE")

command -v aws    >/dev/null || die "aws CLI not found"
command -v docker >/dev/null || die "docker not found"

# ---------------------------------------------------------------- list backups
list_stamps() {
  "${AWSQ[@]}" s3 ls "$BUCKET/postgres/$SOURCE_DB/" \
    | awk '{print $4}' | sed -n "s/^${SOURCE_DB}_\(.*\)\.dump$/\1/p" | sort
}

if [ "$DO_LIST" = 1 ]; then
  say "${BLD}Backups available for database '$SOURCE_DB':${RST}"
  "${AWSQ[@]}" s3 ls "$BUCKET/postgres/$SOURCE_DB/" --human-readable \
    | awk '{printf "  %s %s   %6s %s\n", $1, $2, $3" "$4, $5}'
  say ""
  say "${BLD}Filestore archives:${RST}"
  "${AWSQ[@]}" s3 ls "$BUCKET/filestore/" --human-readable \
    | awk '{printf "  %s %s   %6s %s\n", $1, $2, $3" "$4, $5}' | tail -5
  exit 0
fi

[ -n "$STAMP" ] || die "choose a backup: --latest, --stamp STAMP, or --list to see them"

if [ "$STAMP" = "latest" ]; then
  STAMP="$(list_stamps | tail -1)"
  [ -n "$STAMP" ] || die "no backups found for database '$SOURCE_DB' in $BUCKET"
fi
ok "using backup: $STAMP"

# ------------------------------------------------------------ find containers
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' '$2 ~ /postgres/ {print $1; exit}')"
fi
[ -n "$DB_CONTAINER" ] || die "no running Postgres container found (use --db-container)"
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "container not found: $DB_CONTAINER"
ok "postgres container: $DB_CONTAINER"

if [ -z "$WEB_CONTAINER" ] && [ "$SKIP_FILESTORE" = 0 ]; then
  WEB_CONTAINER="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' '$2 ~ /odoo/ {print $1; exit}')"
  [ -n "$WEB_CONTAINER" ] || warn "no Odoo container found; use --web-container or --skip-filestore"
fi
[ -n "${WEB_CONTAINER:-}" ] && ok "odoo container:     $WEB_CONTAINER"

PGUSER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER 2>/dev/null || echo odoo)"

# -------------------------------------------------------------------- guardrail
IN_USE="$(docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d postgres -tAc \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='$TARGET_DB'" 2>/dev/null || echo 0)"

say ""
say "${BLD}About to restore${RST}"
say "  backup      : $SOURCE_DB @ $STAMP"
say "  into database: ${BLD}$TARGET_DB${RST}  (will be DROPPED and recreated)"
[ "$IN_USE" -gt 0 ] && warn "$TARGET_DB currently has $IN_USE active connection(s) — they will be terminated"
say ""

if [ "$ASSUME_YES" != 1 ]; then
  printf 'Type the target database name to confirm: '
  read -r CONFIRM
  [ "$CONFIRM" = "$TARGET_DB" ] || die "aborted (got '$CONFIRM')"
elif [ "$IN_USE" -gt 0 ]; then
  warn "--yes given, proceeding despite active connections"
fi

# --------------------------------------------------------------------- download
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DUMP="$TMP/${SOURCE_DB}_${STAMP}.dump"

say ""
ok "downloading database dump..."
"${AWSQ[@]}" s3 cp "$BUCKET/postgres/$SOURCE_DB/${SOURCE_DB}_${STAMP}.dump" "$DUMP" --only-show-errors \
  || die "could not download the dump for stamp '$STAMP'"

# Verify before destroying anything.
docker exec -i "$DB_CONTAINER" pg_restore --list < "$DUMP" >/dev/null 2>&1 \
  || die "the downloaded dump failed verification — NOT touching $TARGET_DB"
ok "dump verified ($(du -h "$DUMP" | cut -f1))"

# --------------------------------------------------------------------- database
ok "recreating database $TARGET_DB..."
docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d postgres -q -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TARGET_DB' AND pid<>pg_backend_pid();" >/dev/null
docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d postgres -q -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";"
docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d postgres -q -c "CREATE DATABASE \"$TARGET_DB\" OWNER \"$PGUSER\";"

ok "restoring (this is the slow part)..."
docker exec -i "$DB_CONTAINER" pg_restore -U "$PGUSER" -d "$TARGET_DB" --no-owner --no-acl < "$DUMP" \
  || warn "pg_restore reported issues — check the output above before trusting this restore"

# -------------------------------------------------------------------- filestore
if [ "$SKIP_FILESTORE" = 0 ] && [ -n "${WEB_CONTAINER:-}" ]; then
  ok "downloading filestore..."
  FS="$TMP/filestore_${STAMP}.tar.gz"
  "${AWSQ[@]}" s3 cp "$BUCKET/filestore/filestore_${STAMP}.tar.gz" "$FS" --only-show-errors \
    || die "could not download the filestore archive"

  ok "restoring filestore into $TARGET_DB..."
  # --volumes-from gives us the same /var/lib/odoo as Odoo itself, whether that
  # is a bind mount (EC2) or a named volume (laptop).
  docker run --rm -i --volumes-from "$WEB_CONTAINER" alpine sh -c "
    set -e
    mkdir -p /var/lib/odoo/filestore /tmp/fs
    tar xzf - -C /tmp/fs ./filestore/$SOURCE_DB
    rm -rf /var/lib/odoo/filestore/$TARGET_DB
    mv /tmp/fs/filestore/$SOURCE_DB /var/lib/odoo/filestore/$TARGET_DB
    chown -R 101:101 /var/lib/odoo/filestore/$TARGET_DB
  " < "$FS"
  FCOUNT="$(docker run --rm --volumes-from "$WEB_CONTAINER" alpine \
    sh -c "find /var/lib/odoo/filestore/$TARGET_DB -type f | wc -l")"
  ok "filestore restored ($FCOUNT files)"
else
  warn "filestore skipped — attachments and images will be missing"
fi

# ------------------------------------------------------------------ verification
say ""
say "${BLD}Verification${RST}"
for pair in "pos_order|POS orders" "account_move|Journal entries" "res_partner|Contacts" \
            "product_product|Products" "res_users|Users"; do
  t="${pair%%|*}"; label="${pair#*|}"
  n="$(docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d "$TARGET_DB" -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo '?')"
  printf '  %-16s %s\n' "$label" "$n"
done
MISSING="$(docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d "$TARGET_DB" -tAc \
  "SELECT count(*) FROM ir_attachment WHERE store_fname IS NOT NULL" 2>/dev/null || echo '?')"
printf '  %-16s %s\n' "Filestore refs" "$MISSING"

say ""
ok "restore complete: ${BLD}$TARGET_DB${RST}"
say ""
say "Next: make sure Odoo is allowed to serve it. If odoo.conf pins dbfilter to"
say "another database, this one will not appear until that is widened, e.g.:"
say "  dbfilter = ^(prod|restore_.*|test_.*)\$"
