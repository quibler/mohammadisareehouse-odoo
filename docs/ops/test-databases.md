# Test databases

One Odoo instance serves both the shop and testers, separated by hostname:

| Host | Serves | How |
|---|---|---|
| `erp.mohammadisareehouse.com` (and any unknown Host) | `prod` only | nginx sends `X-Odoo-dbfilter: ^prod(?!.)` |
| `test.erp.mohammadisareehouse.com` | `test_*` only, with the read-only DB selector | nginx sends `X-Odoo-dbfilter: ^test_` |
| `127.0.0.1:8069` via SSH tunnel (developer) | `prod` + `test_*`, full DB manager | no header → `odoo.conf` `dbfilter = ^(prod\|test_.*)$` |

`dbfilter_from_header` (OCA, vendored, loaded via `server_wide_modules`) applies the header
*on top of* `odoo.conf`'s `dbfilter`, so the header can only narrow it. nginx overwrites any
client-sent header. `/web/database/*` (except the selector on the test host), `/xmlrpc*` and
`/jsonrpc` stay 404 publicly — the DB manager's `restore()` was the 2026-08-27 entry vector.

A database not named `test_*` (or `prod`) is served nowhere. Each test DB runs on the same
2 workers / 1.9 GB as the live POS — keep heavy test runs outside shop hours.

## Developer: creating a test database

**Copy of prod — use the script, not the DB manager:**
```bash
./docs/ops/restore-from-s3.sh --latest --target-db test_<name>    # neutralized by default
```
Run it outside shop hours (the load competes with POS for CPU).

> **Never use "Duplicate" on `prod` in the DB manager.** Odoo duplicates with
> `CREATE DATABASE ... TEMPLATE prod`, and to do that it first terminates every connection
> to `prod` (`pg_terminate_backend`) — that drops live POS sessions.

**DB manager (blank DB, drop, backup of a test DB):**
```bash
ssh -i mdsaree-mumbai.pem -L 8069:127.0.0.1:8069 ec2-user@erp.mohammadisareehouse.com
# then open http://localhost:8069/web/database/manager   (master password required)
```
Name every database `test_<something>`. If you restore a prod dump through the manager,
tick **Neutralize** — otherwise crons run and real customers get email. To neutralize after
the fact: `docker compose exec web odoo -c /etc/odoo/odoo.conf -d test_<name> neutralize`.

Prod-copy users carry prod passwords. Create tester accounts inside the test DB (or reset
passwords there) rather than sharing prod credentials.

## Tester access

`https://test.erp.mohammadisareehouse.com` → pick a database on the selector → log in.
Bookmark `https://test.erp.mohammadisareehouse.com/web/login?db=test_<name>` to skip the selector.

## Rollout (one-time) — ordered so prod is never disrupted

1. **DNS** *(cloud change — needs approval)*: Route 53 `A test.erp.mohammadisareehouse.com → 13.206.45.197`.
   Wait until `dig +short test.erp.mohammadisareehouse.com` returns it.
2. **Certificate** *(no downtime; must precede step 3 or `nginx -t` fails)*:
   ```bash
   sudo certbot certonly --nginx --cert-name erp.mohammadisareehouse.com \
     -d erp.mohammadisareehouse.com -d www.erp.mohammadisareehouse.com -d test.erp.mohammadisareehouse.com
   ```
   `certonly` keeps certbot from editing nginx config; the cert path is unchanged.
3. **Restart window (shop closed).** The server's `odoo.conf` carries local edits
   (`dbfilter = ^prod$`, `list_db = False`, the hashed `admin_passwd`) that block `git pull`:
   Nobody holds the current master password's plaintext (see `hardening-and-cost.md`), so a
   new one is set in the same window. Generate it on your laptop and save it in your password
   manager first, then on the server:
   ```bash
   cd /opt/odoo
   git status                                     # expect only odoo.conf modified
   git checkout odoo.conf
   ./deploy.sh                                    # pull, nginx -t + reload (auto-rollback on failure), restart web
   # hash the new password and append it -- read -s keeps it off screen, out of shell
   # history and out of the process list; stdin (no -t) keeps the prompt out of the file
   read -rsp 'New master password: ' P; echo
   printf '%s' "$P" | docker exec -i $(docker ps -qf name=web) python3 -c "import sys; from passlib.context import CryptContext; print('admin_passwd = ' + CryptContext(['pbkdf2_sha512']).hash(sys.stdin.read()))" >> odoo.conf
   unset P
   tail -1 odoo.conf                              # must start with: admin_passwd = $pbkdf2-sha512$
   docker compose restart web
   ```
   Then store the plaintext as SSM SecureString `/odoo/prod/admin_passwd` *(cloud change — approval)*.
   Either half going live first is safe: new nginx + old Odoo ignores the header
   (`dbfilter = ^prod$` still applies); new Odoo + old nginx matches only `prod` until a
   `test_*` database exists.
4. **Verify:**
   ```bash
   curl -sI https://erp.mohammadisareehouse.com/web/database/selector        # 404
   curl -sI https://erp.mohammadisareehouse.com/web/database/manager         # 404
   curl -sI https://test.erp.mohammadisareehouse.com/web/database/manager    # 404
   curl -sI https://test.erp.mohammadisareehouse.com/web/database/selector   # 200
   ```
   and log in to POS on a fresh browser profile at erp — it must land on `prod` with no DB prompt.

**Rollback:** on the server set `dbfilter = ^prod$`, `list_db = False`, remove
`server_wide_modules`, `docker compose restart web`. The nginx header is harmless without the module.
