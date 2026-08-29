# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

Custom Odoo 18 addons for Mohammadi Saree House (a Kuwait retail clothing business), deployed via Docker on an AWS EC2 instance. The repo is mounted directly into the Odoo container as `/mnt/extra-addons`.

Live URL: `erp.mohammadisareehouse.com`  
GitHub: `github.com/quibler/mohammadisareehouse-odoo`

## Local Development

There is no local dev server setup — development happens by editing modules in this repo, then deploying to EC2. The Odoo container reads modules from the mounted volume.

**Restart Odoo after code changes (on EC2):**
```bash
docker compose restart web
```

**Restart + update all modules (on EC2):**
```bash
./deploy.sh --update
```

**Run module update for a specific module (on EC2):**
```bash
docker compose exec web odoo -c /etc/odoo/odoo.conf -u <module_name> --stop-after-init
docker compose restart web
```

**View logs (on EC2):**
```bash
docker compose logs -f web
```

**Deploy from EC2 (pulls latest git + restarts):**
```bash
./deploy.sh           # pull + restart (skips if no git changes)
./deploy.sh --force   # force restart even if no changes
./deploy.sh --update  # pull + restart + run -u all module update
```

## Architecture

Each directory at the repo root is an Odoo addon module. The `mohammadi_suite_installer` meta-module declares all other modules as dependencies, enabling one-click installation.

**Custom modules (business logic):**

| Module | Purpose |
|---|---|
| `pos_kuwait_retail` | POS customizations: barcode generation, salesperson tracking, keyboard shortcuts, fast order processing |
| `vendor_bill_enhancement` | Auto stock moves on bill post, differential processing, auto cost price updates |
| `exchange_currency_rate` | Manual exchange rate input on vendor bills, syncs to global `res.currency.rate` |
| `direct_expense_post` | One-click expense payment bypassing approval workflow |
| `om_account_*` | Odoo Community accounting modules (assets, budget, daily reports, followup, accountant) |
| `om_fiscal_year`, `om_recurring_payments` | Community fiscal/payment modules |
| `accounting_pdf_reports` | Financial PDF reports |
| `pos_restrict_product_stock`, `pos_invoice_payment` | POS stock/invoice extensions |
| `sale_order_customer_filter` | Sales order UX filter |
| `muk_web_*` | MuK backend theme and UI enhancements |

**Odoo module structure convention:**
```
<module>/
  __manifest__.py   # module metadata + dependencies
  __init__.py
  models/           # Python model extensions (inherit Odoo models)
  views/            # XML view definitions
  security/         # access rights (ir.model.access.csv)
  static/           # JS/CSS/assets
  report/           # QWeb report templates
  data/             # XML data records
```

## Infrastructure

- **Docker Compose**: `odoo:18.0` + `postgres:16-alpine`; Odoo binds to `127.0.0.1:8069` (HTTP) and `8072` (WebSocket)
- **Nginx**: Reverse proxy with SSL (Certbot); config at `nginx.conf`, deployed to `/etc/nginx/conf.d/odoo.conf`
- **Data persistence**: Filestore at `/opt/odoo-data/filestore` (uid 101), Postgres at `/opt/odoo-data/postgres`
- **Environment**: Copy `.env.example` → `.env` and set real DB passwords before starting containers
- **odoo.conf**: `workers=2`, `proxy_mode=True`, addons path includes `/mnt/extra-addons`

## Key Odoo 18 Patterns Used

- Model extension via `_inherit`: e.g., `account.move`, `stock.picking`, `pos.session`
- `api.model_create_multi` for batch creates
- QWeb templates for POS receipts and PDF reports
- `pos.config` JS extensions via OWL components in `static/src/`
- Stock moves created programmatically using `stock.picking` + `stock.move` with `_action_done()`
