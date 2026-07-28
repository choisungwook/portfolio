#!/bin/sh
# Reads back what custodian wrote. The tag is the whole state store, so this is
# the only place the grace period is recorded.
set -eu

echo "== ec2 =="
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].{state:State.Name,tags:Tags}' --output json

echo "== ebs =="
aws ec2 describe-volumes --query 'Volumes[].{state:State,tags:Tags}' --output json

echo "== rds =="
aws rds describe-db-instances \
  --query 'DBInstances[].{id:DBInstanceIdentifier,status:DBInstanceStatus}' --output json
