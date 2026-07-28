#!/bin/sh
# Creates the messy account the policies are written against: one tagged instance,
# one untagged instance, a detached volume, and an RDS instance nobody owns.
set -eu

: "${AWS_ENDPOINT_URL:?set AWS_ENDPOINT_URL to the mock endpoint}"
AZ="${AWS_DEFAULT_REGION}a"

ami=$(aws ec2 describe-images --owners amazon --query 'Images[0].ImageId' --output text)

aws ec2 run-instances \
  --image-id "$ami" --instance-type t4g.small --count 1 \
  --tag-specifications \
  "ResourceType=instance,Tags=[{Key=Name,Value=tagged-web},{Key=Owner,Value=akbun},{Key=Environment,Value=dev}]" \
  >/dev/null

aws ec2 run-instances \
  --image-id "$ami" --instance-type t4g.small --count 1 \
  --tag-specifications \
  "ResourceType=instance,Tags=[{Key=Name,Value=untagged-web}]" \
  >/dev/null

aws ec2 create-volume \
  --availability-zone "$AZ" --size 100 --volume-type gp3 \
  --tag-specifications "ResourceType=volume,Tags=[{Key=Name,Value=orphan-data}]" \
  >/dev/null

aws rds create-db-instance \
  --db-instance-identifier finops-lab-db \
  --db-instance-class db.t4g.medium \
  --engine mysql --engine-version 8.0 \
  --allocated-storage 20 \
  --master-username admin --master-user-password "$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  --tags "Key=Name,Value=finops-lab-db" \
  >/dev/null

echo "seeded: 2 ec2 instances, 1 detached volume, 1 rds instance"
