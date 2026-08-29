# Backup, Security Hardening & Incident Response

Status as of **2026-08-30**. Everything below marked ✅ is applied and verified in production.

## Background: the 2026-08-27 compromise

A cryptominer was found running inside the Postgres container as uid 70, disguised as
`crond`/`agetty` in a hidden directory `/var/lib/postgresql/.dbus/`, pinned at ~100% CPU
for two days and beaconing to `45.198.224.93:8081` and `139.99.69.109:10032`.

**Entry vector (confirmed from nginx logs):** Odoo's database-management API was reachable
from the internet. `/xmlrpc/2/db` exposes `restore()`, `drop()`, `create()`, `dump()` and
`change_admin_password()`, gated **only** by the Odoo master password (which was the weak
`@sdF1234`). A crafted dump passed to `restore()` can carry `COPY ... FROM PROGRAM`, which
executes shell commands as the Postgres superuser. The malicious process tree was parented
directly to the Postgres server process, consistent with this chain.

Attacker infrastructure seen in logs:
- `77.239.124.107` — User-Agent `poc-suite/1.0`, hitting `/xmlrpc/2/db` every ~51 minutes.
- `45.198.224.93` — the miner's own C2 address, running recon against `/web/database/list`,
  `/xmlrpc/2/common`, `/xmlrpc/2/object`, `/web/session/authenticate`.
- `208.84.103.154` — `Go-http-client/1.1` against `/xmlrpc/2/db`.

**Note:** XML-RPC returns HTTP 200 even on authentication *failure*, so status codes alone do
not prove the attacker authenticated. What is certain is the endpoints were reachable and
under sustained automated attack.

**Clean:** no attacker-created Odoo crons, server actions, users or API keys; no host-level
cron/systemd persistence; no modified system binaries; no `ld.so.preload`; single SSH key;
IMDSv2 already enforced.

## ✅ 1. Cross-region backups — `backup-to-s3.sh`, `s3-lifecycle.json`

Nightly dump of **every non-template database** plus the filestore, uploaded straight to
`s3://mdsaree-odoo-backups-dr` in **ap-southeast-1** (the instance is in ap-south-1), so a
single-region failure cannot take both. 30-day lifecycle expiry, public access blocked.

> **A previous version of this script was broken:** it dumped a hardcoded database named
> `odoo`, which is an empty 24 MB scaffold. Production is **`prod`** (238 MB, ~16.5k POS
> orders). The script now discovers databases dynamically and verifies each dump with
> `pg_restore --list` before upload, aborting rather than shipping a corrupt backup.

Scheduled by the **`odoo-backup.timer`** systemd timer at 02:00 UTC (05:00 Kuwait).
Amazon Linux 2023 has no cron installed, so a systemd timer is used rather than crontab.

## ✅ 2. Blocking the entry vector — `nginx.conf`

`/web/database/*`, `/xmlrpc*` and `/jsonrpc` now return **404**, logged to
`/var/log/nginx/odoo.blocked.log`. `/web/login` is rate-limited to 20 req/min per IP
(burst 30) — real usage is ~30 hits/day, so this is far above normal.

**Verified safe before blocking:** across all retained nginx logs, 100% of traffic to those
paths came from the three attacker IPs above. Legitimate POS/web clients use
`/web/dataset/call_kw`, `/websocket`, `/web/login`, `/web/image` and `/odoo` exclusively.

Applied with `systemctl reload nginx` — graceful, no container restart, no POS interruption.

> `deploy.sh` copies `nginx.conf` from the repo to `/etc/nginx/conf.d/odoo.conf`, so this
> file **must stay committed** or the next deploy silently reverts the block.

## ✅ 3. DB container network isolation — `db-egress-block.sh`

An iptables `DOCKER-USER` rule drops new connections from the Postgres container to public
addresses. Traffic within Docker (`172.16.0.0/12`) is untouched, so `web` ↔ `db` is
unaffected. Re-applied at boot by **`odoo-db-egress.service`**, which re-resolves the
container IP (it changes on recreate).

Had this been in place, the miner could not have reached its pool.

## ✅ 4. Credentials in AWS SSM Parameter Store — `sync-env-from-secrets.sh`

All credentials live in **SSM Parameter Store** as `SecureString`, Standard tier (free):

| Parameter | Contents |
|---|---|
| `/odoo/prod/db_password` | Postgres password for the `odoo` role |
| `/odoo/prod/admin_user_password` | Odoo web login for user `admin` |
| `/odoo/prod/master_password` | `admin_passwd` from odoo.conf — **still weak, rotation pending** |

The instance reads them through its IAM role — no AWS keys on the box. The script renders
`/opt/odoo/.env` at mode 600; `deploy.sh` calls it automatically. A local copy also lives in
the repo's gitignored `.env`.

IAM role `odoo-ec2-backup-role` grants exactly three things: `s3:PutObject` to the backup
bucket, read on `/odoo/prod/*` parameters (plus `kms:Decrypt` scoped via `kms:ViaService`
to SSM), and `AmazonSSMManagedInstanceCore`.

> An earlier iteration used Secrets Manager. It was consolidated into Parameter Store to keep
> a single source of truth and drop the $0.40/month charge; the old secret
> `odoo/prod/credentials` is scheduled for deletion on 2026-09-06 (recoverable until then).

## ✅ 4b. Odoo `admin` login rotated (2026-08-30)

The `admin` web user was still on the default **`admin`/`admin`** — confirmed live, then
rotated. Verified afterwards that the new password authenticates (uid 2) and the old one is
rejected. Done with a direct `pbkdf2_sha512` (600k rounds) hash update rather than starting an
Odoo shell, to avoid memory pressure on the 1.9 GB instance while POS was serving.

**No restart, and no POS disruption:** the only sessions active at the time belonged to
`shop99`, `shop102` and `online`; `admin` was not logged in. POS account passwords were
deliberately left untouched — changing them invalidates live sessions.

> Compose reads `.env` only when **creating** a container. `docker compose restart` does not
> pick up a rotated password — that needs `docker compose up -d`, which recreates containers
> and causes brief downtime.

## ✅ 5. Detection — CloudWatch

Alarm **`odoo-ec2-high-cpu`**: average CPU > 80% for 15 minutes → SNS topic `odoo-alerts`.
The miner ran at ~100% for two days with nobody alerted.

**Outstanding:** no email is subscribed to `odoo-alerts` yet, so the alarm currently notifies
nobody. Subscribe with:
```bash
aws sns subscribe --topic-arn arn:aws:sns:ap-south-1:606328517978:odoo-alerts \
  --protocol email --notification-endpoint YOU@EXAMPLE.COM --region ap-south-1 --profile mdsaaree
```

## ✅ 6. SSM enabled (SSH lockdown still pending)

The instance is registered and **Online** in Systems Manager; remote command execution is
verified working. Registration initially failed with `AccessDenied` on
`ssm:UpdateInstanceInformation` purely due to IAM propagation delay — it succeeded on retry.

**Port 22 is deliberately still open.** The `session-manager-plugin` is not installed on the
operator's laptop, so there is no interactive shell alternative yet. Do not revoke SSH until:
```bash
brew install --cask session-manager-plugin
aws ssm start-session --target i-02890e8ceb197581e --region ap-south-1 --profile mdsaaree   # must work
# only then:
aws ec2 revoke-security-group-ingress --group-id sg-0a77ee12d529cc564 \
  --protocol tcp --port 22 --cidr 0.0.0.0/0 --profile mdsaaree
```

## Still open

| Item | Why it matters | Blocker |
|---|---|---|
| **Odoo master password still `@sdF1234`** | Weak; gates the DB-management API | Editing `odoo.conf` needs an Odoo restart — POS is live |
| Widen `dbfilter` to `^(prod\|test_.*)$` | Needed to serve test databases for upgrade rehearsals | Same restart window |
| Drop unused `odoo` and `testing` databases | Verified unused (0 connections, last write Jul); shrinks backups | None — safe whenever; both are in tonight's S3 backup |
| `list_db`/`dbfilter` only on the server, not in git | A fresh clone loses them — security regression | Same restart constraint; bundle with the above |
| `odoo` role is Postgres bootstrap superuser | Enables `COPY ... FROM PROGRAM` | Cannot be demoted; needs a new non-superuser role + ownership migration, tested separately |
| SNS email subscription | Alarm notifies nobody | Needs an email address |
| SSH lockdown | Port 22 open to `0.0.0.0/0` | Needs `session-manager-plugin` locally first |
| Restore drill | An untested backup is not a backup | Should restore `prod` into a scratch DB and verify row counts |

The superuser issue is genuinely mitigated but **not eliminated** by items 2 and 3: the
network path in is closed and the path out is blocked, but a future authenticated SQL-level
compromise could still execute shell commands inside the DB container.

## Cost

| Item | Est. / month |
|---|---|
| S3 cross-region backups (~285 MB/night, 30-day retention) | $0.50–1.50 |
| SSM Parameter Store (Standard tier), SSM, security groups, CloudWatch alarm, SNS | $0 |
| **Total** | **~$0.50–1.50** |

Deliberately not used: DLM snapshots, S3 replication, bucket versioning, Glacier tiering,
multi-AZ RDS, GuardDuty, WAF — none justified when downtime is acceptable and the goal is
data-loss prevention.

## Forensics

The payload is preserved locally as `dbus-forensics.tar.gz` (`ash`, `crond`, `config.json`,
`.rsyslogd.log`). It was **not** uploaded anywhere. Recreating the containers during password
rotation destroyed the old DB container's logs, so the exact SQL the attacker ran could not be
reconstructed.
