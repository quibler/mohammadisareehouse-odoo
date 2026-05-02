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

NGINX_DEST=/etc/nginx/conf.d/odoo.conf
if ! sudo diff -q nginx.conf "$NGINX_DEST" > /dev/null 2>&1; then
    echo "Syncing nginx config..."
    sudo cp nginx.conf "$NGINX_DEST"
    sudo nginx -t
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
