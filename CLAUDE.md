# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

Custom Odoo 18 addons for Mohammadi Saree House (a Kuwait retail clothing business), deployed via Docker on a single AWS EC2 instance (`t3.small`, ap-south-1). The repo is mounted directly into the Odoo container as `/mnt/extra-addons`, and also holds the production infra config (`docker-compose.yml`, `odoo.conf`, `nginx.conf`, `deploy.sh`) and ops scripts (`docs/ops/`).

Live URL: `erp.mohammadisareehouse.com` — production database is `prod`.
GitHub: `github.com/quibler/mohammadisareehouse-odoo`

## Production Constraints

- **POS is live in the shop during business hours.** Restarting Odoo, recreating containers, or running `-u` interrupts sales. Anything needing a restart (e.g. `odoo.conf` changes) waits for a restart window.
- **Never change cloud resources (AWS or otherwise) without explicit permission.** Read-only investigation (CloudWatch, `describe-*`, logs) is fine.
- AWS CLI profile is `mdsaaree` (double-a). The `default` profile has stale keys — don't use or overwrite it.
- Only 2 Odoo workers on 1.9 GB RAM. A single slow POS RPC can pin a worker for its full `limit_time_real` (1200s) and starve the other; avoid heavy Odoo shells or migrations on prod while POS is serving.
- `odoo.conf` holds `admin_passwd` (the master password) — never commit a real value. Which DB each host serves is set by nginx via `X-Odoo-dbfilter` (`dbfilter_from_header`): `erp` → `prod`, `test.erp` → `test_*` — see `docs/ops/test-databases.md`. Never use DB-manager "Duplicate" on `prod` (it kills prod connections).

## Local Development

`docker-compose.override.yml` is auto-merged by `docker compose` locally: it swaps the `/opt/odoo-data` bind mounts for named volumes and runs single-process (`--workers=0`). The EC2 host has no override file.

```bash
cp .env.example .env            # set DB passwords
docker compose up -d            # http://localhost:8069
docker compose logs -f web
```

Update one module after code changes (local or EC2):
```bash
docker compose exec web odoo -c /etc/odoo/odoo.conf -d <db> -u <module_name> --stop-after-init
docker compose restart web
```

Python/XML changes need a module update (`-u`) to reload views/data; pure Python changes need at least a restart. There is no test suite, linter, or CI — verify changes by running them in Odoo.

Any local copy of prod must be **neutralized** (crons off, SMTP disabled) — see `restore-from-s3.sh` below. A non-neutralized copy can email real customers.

## Deploy (on EC2, `/opt/odoo`)

```bash
./deploy.sh           # git pull + sync .env from SSM + sync nginx.conf + restart web (no-op if no git changes)
./deploy.sh --force   # restart even if nothing changed
./deploy.sh --update  # also runs `-u all`
```

`deploy.sh` copies `nginx.conf` to `/etc/nginx/conf.d/odoo.conf` on every deploy, so the repo copy is the source of truth — edits made only on the server get reverted. Note `docker compose restart` does **not** re-read `.env`; a rotated password needs `docker compose up -d` (recreates containers, brief downtime).

## Architecture

Each directory at the repo root is an Odoo addon. `mohammadi_suite_installer` is a meta-module listing all others in `depends` for one-click install (note: `pos_restrict_product_stock`, `pos_invoice_payment`, `sale_order_customer_filter` are not in it).

**Custom business logic** (where most work happens):

| Module | Purpose |
|---|---|
| `pos_kuwait_retail` | POS customizations: barcode/label generation, salesperson tracking, receipts, keyboard shortcuts. OWL frontend in `static/src/app` and `static/src/overrides` |
| `vendor_bill_enhancement` | Posting a vendor bill creates stock moves (with differential processing on re-post) and auto-updates product cost price |
| `exchange_currency_rate` | Manual exchange rate on vendor bills, synced into global `res.currency.rate` |
| `direct_expense_post` | One-click expense payment bypassing approval |
| `pos_restrict_product_stock`, `pos_invoice_payment`, `sale_order_customer_filter` | Small POS/sales extensions |

**Third-party modules** (`om_*`, `accounting_pdf_reports` from Odoo Mates; `muk_web_*` MuK theme) — vendored, rarely modified.

Key patterns: `_inherit` extensions of `account.move`, `stock.picking`, `pos.session`, `pos.order`; stock moves created programmatically via `stock.picking` + `stock.move` + `_action_done()`; QWeb for POS receipts and PDF reports. Bump the `version` in `__manifest__.py` when changing a module.

## Infrastructure & Ops

- **Stack**: `odoo:18.0` + `postgres:16-alpine`; Odoo bound to `127.0.0.1:8069/8072` behind nginx + Certbot. Data in `/opt/odoo-data/{filestore,postgres}`. Odoo runs as uid 100, gid 101.
- **nginx** returns 404 for `/web/database/*`, `/xmlrpc*`, `/jsonrpc` (the entry vector of the 2026-08-27 cryptominer compromise) and rate-limits `/web/login`. Legitimate clients only use `/web/dataset/call_kw`, `/websocket`, `/web/login`, `/web/image`, `/odoo`. Don't reopen these paths.
- **Credentials** live in SSM Parameter Store under `/odoo/prod/*`; `docs/ops/sync-env-from-secrets.sh` renders `/opt/odoo/.env` using the instance IAM role. (The comment in `deploy.sh` still says Secrets Manager — it's SSM.)
- **Backups**: `docs/ops/backup-to-s3.sh` runs nightly (systemd `odoo-backup.timer`, 02:00 UTC) using `odoo db dump` → `s3://mdsaree-odoo-backups-dr` (ap-southeast-1). `check-backup-freshness.sh` alerts to SNS `odoo-alerts` if the newest backup is >30h old.
- **Restore** uses `odoo db load` (never raw `pg_restore` — it leaves asset bundles stale and breaks CSS). Neutralizes by default:
  ```bash
  ./docs/ops/restore-from-s3.sh --list
  ./docs/ops/restore-from-s3.sh --latest --target-db test_upgrade          # neutralized copy
  ./docs/ops/restore-from-s3.sh --latest --target-db prod --production     # real recovery only
  ```
- `db-egress-block.sh` (via `odoo-db-egress.service`) blocks the Postgres container from reaching the internet.

`docs/ops/hardening-and-cost.md` is the authoritative record of the incident, what's applied, and what's still open — read it before touching security or infra. `docs/superpowers/plans/` holds implementation plans for past features.
