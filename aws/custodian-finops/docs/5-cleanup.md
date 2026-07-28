# 5. Cleanup

Teardown commands are in [setup.md](./setup.md): `docker compose down -v` for the mock, `terraform destroy` for AWS. This page covers what those two commands do not remove.

## What destroy misses

| Left behind | Why | Removal |
|---|---|---|
| EBS snapshot from `ebs-unattached-delete` | Custodian created it, Terraform never knew about it | `aws ec2 describe-snapshots --owner-ids self` then delete by id |
| Secrets Manager secret for the RDS master password | `manage_master_user_password` schedules deletion, default 30 days | leave it, or `aws secretsmanager delete-secret --force-delete-without-recovery` |
| `c7n_*` tags on anything you kept | Written by custodian, invisible to Terraform state | `aws ec2 delete-tags` |

The snapshot is the one worth checking. A cleanup policy that snapshots before deleting will, over months, replace the cost it was written to remove.

## Confirm the account is quiet

Three checks: instances, databases, and volumes attached to nothing.

```bash
aws ec2 describe-instances \
  --filters Name=tag:Project,Values=custodian-finops \
  --query 'Reservations[].Instances[].InstanceId' --output text
aws rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier' --output text
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query 'Volumes[].VolumeId' --output text
```

All three should return nothing. The third is the check most easily skipped, and detached volumes are what this hands-on was about.

## If you keep the policies running

Two rules before any of this runs on a schedule.

- Keep the mark and the act as separate policies, and deploy the mark first. Watching a week of marks with no acts is the only cheap way to find out a filter is wrong.
- Archive `out/` from every run. `resources.json` is the record of what a policy claimed, and after an incident it is the only evidence of what the engine actually saw.
