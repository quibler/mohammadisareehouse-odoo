#!/bin/bash
# EC2 User Data script for Amazon Linux 2023
# Run once on first boot. Takes ~3-5 minutes.

set -e

# ── 1. System packages ────────────────────────────────────────────────────────
dnf update -y
dnf install -y docker nginx certbot python3-certbot-nginx git

# ── 2. Docker ─────────────────────────────────────────────────────────────────
systemctl enable --now docker
usermod -aG docker ec2-user

# Docker Compose plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ── 3. Data directories ───────────────────────────────────────────────────────
mkdir -p /opt/odoo-data/postgres /opt/odoo-data/filestore
# Odoo container runs as uid 101
chown -R 101:101 /opt/odoo-data/filestore

# ── 4. Deploy key for GitHub ──────────────────────────────────────────────────
# BEFORE RUNNING THIS SCRIPT:
#   1. Generate a key pair:  ssh-keygen -t ed25519 -f /tmp/odoo_deploy_key -N ""
#   2. Add the PUBLIC key as a Deploy Key in GitHub:
#      https://github.com/quibler/mohammadisareehouse-odoo/settings/keys
#   3. Paste the PRIVATE key content below between the EOF markers

mkdir -p /root/.ssh
cat > /root/.ssh/odoo_deploy_key << 'EOF'
PASTE_PRIVATE_KEY_HERE
EOF
chmod 600 /root/.ssh/odoo_deploy_key

cat >> /root/.ssh/config << 'EOF'
Host github.com
    IdentityFile /root/.ssh/odoo_deploy_key
    StrictHostKeyChecking no
EOF

# ── 5. Clone repo ─────────────────────────────────────────────────────────────
git clone git@github.com:quibler/mohammadisareehouse-odoo.git /opt/odoo
chmod +x /opt/odoo/deploy.sh

# ── 6. Environment file ───────────────────────────────────────────────────────
# Copy example and fill in real passwords before starting containers
cp /opt/odoo/.env.example /opt/odoo/.env
# EDIT /opt/odoo/.env with real passwords before proceeding

# ── 7. Nginx ──────────────────────────────────────────────────────────────────
cp /opt/odoo/nginx.conf /etc/nginx/conf.d/odoo.conf
# Replace mohammadisareehouse.com placeholder
# EDIT /etc/nginx/conf.d/odoo.conf and replace mohammadisareehouse.com with your actual domain

systemctl enable --now nginx

# ── 8. Start containers ───────────────────────────────────────────────────────
# NOTE: Edit /opt/odoo/.env with real passwords first, then run:
#   cd /opt/odoo && docker compose up -d

echo ""
echo "════════════════════════════════════════════════════════"
echo " Bootstrap complete. Manual steps remaining:"
echo ""
echo " 1. Edit /opt/odoo/.env — set real DB passwords"
echo " 2. cd /opt/odoo && docker compose up -d"
echo " 3. Point your domain A record to this instance's public IP"
echo " 4. Once DNS propagates:"
echo "    certbot --nginx -d mohammadisareehouse.com"
echo "════════════════════════════════════════════════════════"
