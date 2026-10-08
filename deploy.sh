#!/bin/bash
set -e

cd /opt/odoo

echo "Pulling latest code..."
BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" && "$1" != "--force" ]]; then
    echo "Nothing changed. Exiting."
    exit 0
fi

echo "Changes detected ($BEFORE -> $AFTER)"

# Refresh .env from AWS Secrets Manager (secret: odoo/prod/credentials).
# NOTE: `docker compose restart` below does NOT re-read .env — Compose only
# reads it when creating a container. To roll out a rotated password you must
# run `docker compose up -d` (recreates containers, brief downtime).
if [ -x /opt/odoo-data/sync-env-from-secrets.sh ]; then
    echo "Syncing .env from Secrets Manager..."
    sudo /opt/odoo-data/sync-env-from-secrets.sh
fi

NGINX_DEST=/etc/nginx/conf.d/odoo.conf
if ! sudo diff -q nginx.conf "$NGINX_DEST" > /dev/null 2>&1; then
    echo "Syncing nginx config..."
    sudo cp "$NGINX_DEST" "$NGINX_DEST.bak"
    sudo cp nginx.conf "$NGINX_DEST"
    # Roll back on a bad config so a later reload/reboot can't pick it up.
    if ! sudo nginx -t; then
        echo "nginx config test failed -- restoring previous config."
        sudo cp "$NGINX_DEST.bak" "$NGINX_DEST"
        exit 1
    fi
    sudo systemctl reload nginx
else
    echo "nginx config unchanged, skipping reload."
fi

echo "Restarting Odoo..."
docker compose restart web

if [[ "$1" == "--update" ]]; then
    echo "Waiting for Odoo to start..."
    sleep 10
    echo "Running module update..."
    docker compose exec web odoo -c /etc/odoo/odoo.conf -u all --stop-after-init
    docker compose restart web
fi

echo "Done."
