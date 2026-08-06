# The read-only guarantee is structural

## Decision

All AWS calls live in awsviewer-core's ec2.rs (plus the two auth modules), and that module exposes exactly two functions: list_instances and instance_detail, built on DescribeInstances, DescribeVolumes and DescribeSecurityGroups. No other module constructs an AWS client.

## Reason

"We promise not to call mutating APIs" is a convention that survives until one convenient feature. Funneling every client through one small module makes the promise checkable in review: a mutating call cannot appear without a diff in the one file whose job is to not have one.
