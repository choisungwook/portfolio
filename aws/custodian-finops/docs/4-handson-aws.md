# 4. Lab 2: real EC2 and RDS

The mock proves the pipeline. It cannot show what makes these policies risky in a real account: default tags, CloudWatch data, and the fact that RDS stop is not the same operation as EC2 stop.

Create the resources first: [setup.md](./setup.md). Terraform builds the same shape as the mock, in the default VPC, with SSM instead of SSH.

| Resource | Tags | Which policy should claim it |
|---|---|---|
| `custodian-finops-tagged` EC2 | Owner, Environment, `c7n_schedule=off` | none |
| `custodian-finops-untagged` EC2 | Name only | tag enforcement, offhours |
| `custodian-finops-orphan` EBS | Name only, attached to nothing | orphans |
| `custodian-finops-db` RDS | Name only | tag enforcement, idle |

## Step 1. Dry run before anything else

Run the read only policy against the real account:

```bash
cd aws/custodian-finops
custodian run --dryrun --cache-period 0 -s out policies/1-tag-audit.yml
```

Expect one EC2 instance and one RDS instance. If the count is higher than the table above, the policy is reaching resources this lab did not create, and the filter needs an account or tag scope before it ever runs for real.

## Step 2. The default tag trap

Terraform sets `default_tags` with `ManagedBy` and `Project` on every resource. Neither is `Owner`, so the audit still matches, which is the point: an account can be fully tagged by IaC and still be unattributable for cost.

Check what a policy would consider sufficient before writing the enforcement rule.

```bash
aws ec2 describe-instances \
  --filters Name=tag:Project,Values=custodian-finops \
  --query 'Reservations[].Instances[].Tags' --output json
```

## Step 3. Enforcement, with a real console to look at

Write the deadline onto the untagged resources:

```bash
custodian run --cache-period 0 -s out policies/2-tag-enforce.yml
```

Open the EC2 console and read the tag on the untagged instance. That is the part the mock cannot demonstrate: the owner sees the deadline where they already work, without being sent a report.

To watch the expiry branch without waiting, back-date the tag by hand.

```bash
aws ec2 create-tags --resources <instance-id> \
  --tags 'Key=c7n_tag_compliance,Value=Resource does not meet policy: stop@2000/01/01'
custodian run --cache-period 0 -s out policies/2-tag-enforce.yml
```

## Step 4. Offhours, and the RDS asymmetry

Check what the schedule policies would claim right now:

```bash
custodian run --dryrun --cache-period 0 -s out policies/3-offhours.yml
```

The filter is `opt-out: true`, so every instance is in scope unless it carries `c7n_schedule: off`. The tagged instance carries it and is excluded. Inverting that default is the single decision that decides whether an offhours policy saves money or generates complaints.

RDS matters here for a reason EC2 does not have: AWS restarts a stopped RDS instance automatically after seven days. An offhours policy that only stops RDS therefore looks like it works for a week and then quietly stops saving anything. `rds-onhours-start` is not optional, and neither is checking that it ran.

## Step 5. Rightsizing needs history

The only policy set that asks CloudWatch:

```bash
custodian run --dryrun --cache-period 0 -s out policies/5-rightsizing.yml
```

Zero on a fresh lab, correctly: the metrics filter asks for 14 days of CPU and the instances are hours old. In a real account this is the only lever whose evidence can be wrong, because low CPU also describes a healthy standby. That is why `ec2-low-cpu-tag` only tags, and the terminate in `ec2-stopped-too-long` is a `mark-for-op` with a 14 day fuse rather than a direct action.

## Step 6. Permissions

`terraform output custodian_policy_arn` is an IAM policy created but attached to nothing. Read it before attaching it anywhere. Two choices in it are deliberate:

- `ec2:TerminateInstances` is absent, so no policy in this repository can terminate anything even if a filter is wrong.
- Deletion actions are allowed only on resources that already carry the `c7n_orphan` tag, so a mistyped filter cannot delete a resource the mark step never saw.

The IAM condition is the backstop for the case the YAML review misses. Tear everything down when finished: [5-cleanup.md](./5-cleanup.md).
