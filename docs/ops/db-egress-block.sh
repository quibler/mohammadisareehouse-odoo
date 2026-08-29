#!/usr/bin/env bash
# Block the Postgres container from reaching the public internet.
#
# The DB container has no legitimate need for outbound internet access. On
# 2026-08-27 a cryptominer planted inside it (via COPY ... FROM PROGRAM) used
# that access to reach its pool/C2 at 45.198.224.93 and 139.99.69.109.
#
# Intra-Docker traffic (172.16.0.0/12) is deliberately NOT blocked, so
# web <-> db connectivity is unaffected. Only NEW connections from the db
# container out to public addresses are dropped.
#
# Re-run after any container recreate (the container IP can change); the
# odoo-db-egress.service systemd unit does this automatically at boot.
set -euo pipefail

DB_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' odoo-db-1)"
if [ -z "$DB_IP" ]; then
  echo "could not resolve odoo-db-1 IP" >&2
  exit 1
fi

# Remove any stale copies of this rule, then (re)insert for the current IP.
while iptables -C DOCKER-USER -s "$DB_IP" ! -d 172.16.0.0/12 -j DROP 2>/dev/null; do
  iptables -D DOCKER-USER -s "$DB_IP" ! -d 172.16.0.0/12 -j DROP
done
iptables -I DOCKER-USER 1 -s "$DB_IP" ! -d 172.16.0.0/12 -j DROP

echo "egress blocked for odoo-db-1 (${DB_IP})"
