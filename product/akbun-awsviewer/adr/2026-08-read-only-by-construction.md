# The read-only guarantee is structural

## Decision

AWS calls live in awsviewer-core's ec2.rs and cloudtrail.rs. They expose DescribeInstances, DescribeVolumes, DescribeSecurityGroups, and LookupEvents only. No other module constructs an AWS service client.

## Reason

"We promise not to call mutating APIs" is a convention that survives until one convenient feature. Service clients remain isolated in small modules whose exported operations are reviewable.
