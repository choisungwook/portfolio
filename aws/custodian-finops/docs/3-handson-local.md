# 3. Lab 1: the mock account

Run every policy without an AWS account. The mock answers the same describe and tag calls, so the counts and the tag values below are real output, not illustrations.

Start the environment first: [setup.md](./setup.md). The seed creates one tagged instance, one untagged instance, a detached volume, and an RDS instance with no owner.

## Step 1. Look, change nothing

`1-tag-audit.yml` has no actions block, so this is read only twice over.

```bash
docker compose run --rm custodian run --dryrun --cache-period 0 -s /out /policies/1-tag-audit.yml
```

The log line per policy, with timestamps stripped:

```
policy:ec2-missing-cost-tags resource:aws.ec2 count:1
policy:rds-missing-cost-tags resource:aws.rds count:1
policy:ebs-unattached-audit  resource:aws.ebs count:1
```

One of two instances matched. The other carries `Owner` and `Environment`, and that difference is the only difference between them. Read `out/ec2-missing-cost-tags/resources.json` for the full describe response of the matched instance.

`--cache-period 0` matters. Custodian caches describe results for 15 minutes by default, so without it a second run inside that window reads stale tags and the next steps appear to do nothing.

## Step 2. Write the deadline

Run the enforcement file for real, with no dryrun:

```bash
docker compose run --rm custodian run --cache-period 0 -s /out /policies/2-tag-enforce.yml
```

Four policies ran, two of them wrote a tag:

```
policy:ec2-untagged-mark count:1
custodian.actions:INFO Tagging 1 resources for stop on 2026/08/01
policy:ec2-untagged-stop count:0
policy:rds-untagged-mark count:1
custodian.actions:INFO Tagging 1 resources for stop on 2026/08/04
```

Nothing stopped. The stop policy in the same file found zero resources, because the deadline it looks for is four days out. Read the tag back:

```bash
docker compose run --rm seed /scripts/show-tags.sh
```

The tag custodian left on the untagged instance:

```json
{ "Key": "c7n_tag_compliance", "Value": "Resource does not meet policy: stop@2026/08/01" }
```

That string is the entire state of the enforcement loop. Custodian stored nothing on its own side.

## Step 3. Let the deadline pass

Waiting four days is not practical, so back-date the tag.

```bash
docker compose run --rm seed /scripts/expire-mark.sh
docker compose run --rm custodian run --cache-period 0 -s /out /policies/2-tag-enforce.yml
```

The counts have swapped between the two policies:

```
policy:ec2-untagged-mark  count:0
policy:ec2-untagged-stop  count:1
policy:ec2-untagged-stop  action:stop resources:1
```

The same file, unchanged, now takes a different branch. The mark policy skipped the instance because it is already marked, and the stop policy claimed it because the date passed.

Checkpoint: add an `Owner` tag to that instance and run the file again. `ec2-untagged-unmark-when-fixed` removes the mark, and the deadline is gone. A fix cancels enforcement with no ticket.

## Step 4. Orphans

Same command against the orphan policies:

```bash
docker compose run --rm custodian run --cache-period 0 -s /out /policies/4-orphans.yml
```

The volume is marked, not deleted:

```
policy:ebs-unattached-mark   count:1
custodian.actions:INFO Tagging 1 resources for delete on 2026/08/04
policy:ebs-unattached-delete count:0
```

Same shape as step 2, with a longer fuse and a `snapshot` action ordered before `delete`. Actions run in the order they are written, which is the difference between a recoverable mistake and an unrecoverable one.

## What the mock cannot show

`3-offhours.yml` matches on the wall clock, so it returns zero unless the run happens near the boundary hour. `5-rightsizing.yml` asks CloudWatch, and the mock has no metrics, so it always returns zero. Both run without error, which is all the mock can tell you. Move to real resources: [4-handson-aws.md](./4-handson-aws.md).
