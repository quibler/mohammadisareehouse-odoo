#!/usr/bin/env bash
#
# Alerts if the newest backup in S3 is older than MAX_AGE_HOURS.
#
# This exists because Layer 1 (OnFailure= on odoo-backup.service) only fires
# when the service actually RUNS and fails. It cannot catch the timer being
# disabled, the host being down, or systemd itself being broken — cases where
# the service simply never runs, so there is nothing to fail. This script is
# the independent check for "did a backup happen at all," and does not depend
# on the backup service, its timer, or this host's systemd state.
#
# Scheduled by check-backup-freshness.timer, offset from the 02:00 backup so
# it checks after the backup should have completed.
set -euo pipefail

BUCKET="s3://mdsaree-odoo-backups-dr"
DB="prod"
MAX_AGE_HOURS=30
SNS_TOPIC="arn:aws:sns:ap-south-1:606328517978:odoo-alerts"
REGION="ap-south-1"

LATEST_STAMP="$(aws s3 ls "$BUCKET/odoo/" --region "$REGION" | awk '{print $4}' \
  | grep "^${DB}_" | sort | tail -1 | sed -n "s/^${DB}_\(.*\)\.zip$/\1/p")"

if [ -z "$LATEST_STAMP" ]; then
  aws sns publish --topic-arn "$SNS_TOPIC" --region "$REGION" \
    --subject "Odoo backup ALERT: no backups found" \
    --message "No backups exist at all in $BUCKET/odoo/. Check odoo-backup.timer and .service." \
    >/dev/null
  echo "ALERT sent: no backups found" >&2
  exit 1
fi

# STAMP is YYYY-MM-DD_HHMM; date -d wants "YYYY-MM-DD HH:MM".
LATEST_EPOCH="$(date -d "$(echo "$LATEST_STAMP" | sed -E 's/_([0-9]{2})([0-9]{2})$/ \1:\2/')" +%s)"
NOW_EPOCH="$(date +%s)"
AGE_HOURS=$(( (NOW_EPOCH - LATEST_EPOCH) / 3600 ))

if [ "$AGE_HOURS" -gt "$MAX_AGE_HOURS" ]; then
  aws sns publish --topic-arn "$SNS_TOPIC" --region "$REGION" \
    --subject "Odoo backup ALERT: stale (${AGE_HOURS}h old)" \
    --message "Newest backup in $BUCKET/odoo/ is ${DB}_${LATEST_STAMP}.zip, ${AGE_HOURS} hours old (limit ${MAX_AGE_HOURS}h). Check odoo-backup.timer and .service on the EC2 host." \
    >/dev/null
  echo "ALERT sent: latest backup is ${AGE_HOURS}h old" >&2
  exit 1
fi

echo "OK: latest backup ${DB}_${LATEST_STAMP}.zip is ${AGE_HOURS}h old"
