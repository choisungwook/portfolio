#!/bin/sh
# Back-dates the deadline custodian wrote, so the "grace period expired" branch
# can be observed without waiting four days.
set -eu

id=$(aws ec2 describe-instances \
  --filters Name=tag:Name,Values=untagged-web \
  --query 'Reservations[].Instances[].InstanceId' --output text)

aws ec2 create-tags --resources "$id" \
  --tags 'Key=c7n_tag_compliance,Value=Resource does not meet policy: stop@2000/01/01'

echo "backdated the deadline on $id"
