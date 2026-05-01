#!/bin/bash
set -e

cd /opt/odoo

echo "Pulling latest code..."
git pull origin main

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
