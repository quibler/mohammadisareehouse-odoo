# Backup + Hardening — Final Plan

## 1. Cross-region logical backups to S3 (the whole data-loss safety net)

Files: `backup-to-s3.sh`, `s3-lifecycle.json`

```bash
# One-time: bucket in a DIFFERENT region than the EC2 instance + lifecycle + block public access
aws s3api create-bucket --bucket mdsaree-odoo-backups-dr --region <DR_REGION> \
  --create-bucket-configuration LocationConstraint=<DR_REGION> --profile mdsaaree
aws s3api put-public-access-block --bucket mdsaree-odoo-backups-dr \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  --profile mdsaaree
aws s3api put-bucket-lifecycle-configuration --bucket mdsaree-odoo-backups-dr \
  --lifecycle-configuration file://s3-lifecycle.json --profile mdsaaree

# On EC2: copy backup-to-s3.sh to /opt/odoo-data/, adjust COMPOSE_DIR, then:
crontab -e
# 0 2 * * * /opt/odoo-data/backup-to-s3.sh >> /var/log/odoo-backup.log 2>&1
```
IAM: the EC2 instance role needs `s3:PutObject` scoped to `mdsaree-odoo-backups-dr/*`.

No EBS snapshots, no replication — the script uploads straight to a bucket in another region, satisfying cross-region protection with a single upload. Recovery path: relaunch EC2 (from a plain AMI or fresh instance) + `pg_restore` the dump + untar the filestore.

## 2. SSM instead of open SSH + lock down the security group

```bash
# One-time: attach SSM permissions to the instance's IAM role
aws iam attach-role-policy --role-name <INSTANCE_ROLE_NAME> \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore --profile mdsaaree

# Verify agent + registration
# systemctl status amazon-ssm-agent   (on the instance)
aws ssm describe-instance-information --profile mdsaaree

# Only after confirming: aws ssm start-session --target <INSTANCE_ID> --profile mdsaaree works,
# remove the inbound SSH rule:
aws ec2 revoke-security-group-ingress --group-id <SG_ID> \
  --protocol tcp --port 22 --cidr 0.0.0.0/0 --profile mdsaaree
```
Security group ends up allowing only 80/443 from `0.0.0.0/0`; no port 22.

## 3. CloudWatch alarms (disk/CPU) — free tier, optional but recommended
Basic alarm on disk >80% and sustained high CPU, notifying via SNS email.

## Cost added per month

| Item | Estimate | Notes |
|---|---|---|
| S3 cross-region backups (~1–5GB/night, 30-day retention, S3 Standard) | **$0.50–1.50** | Small dataset; no versioning, no tiering overhead |
| SSM Session Manager | **$0** | Free for EC2 |
| Security group changes | **$0** | Config only |
| CloudWatch alarms | **$0** | Within free tier for one instance |
| **Total** | **~$1–2/month** | |

Dropped from the earlier draft (redundant given the S3 cross-region backup already covers recovery): DLM EBS snapshots, S3 Cross-Region Replication, bucket versioning, Glacier tiering. A once-off/manual AMI snapshot after major changes is a free, sufficient fallback for "rebuild the box."

## Order of operations
1. Create the DR-region S3 bucket + lifecycle rule.
2. Scope IAM role, deploy `backup-to-s3.sh` + cron on EC2, verify a manual run succeeds and the object lands in S3.
3. Attach SSM policy to instance role, verify `aws ssm start-session` works.
4. Only then revoke the SSH ingress rule from the security group.
5. (Optional) CloudWatch alarms.
