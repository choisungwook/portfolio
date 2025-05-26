---
mode: 'agent'
tools: ['githubRepo', 'codebase']
description: 'AWS cloudwatch alarm and slack integration with lambda'
---

I want to send notifications to Slack by integrating AWS CloudWatch Alarms with Lambda.

The scenario is as follows:
1. A CloudWatch alarm condition is triggered when MySQL RDS CPU utilization exceeds 80%.
2. CloudWatch uses SNS to trigger Lambda.
3. Lambda sends a notification to Slack.
4. When RDS CPU utilization drops, a 'resolve' notification is sent to Slack using processes 2 and 3.

My questions for you are:
1. Is this a good or feasible scenario?
2. Can I increase RDS CPU utilization using AWS Fault Injection?
3. If this scenario is feasible, please provide the entire scenario code in Terraform.

Requirements for the form:
* The region is ap-northeast-2
* I will use the smallest RDS instance type for CPU
* use terraform variables and terraform.tfavars
* terraform tags is declared in variables.tf file. The tags should be used in all resources created by terraform. the tags should include Name, Project. The name is the cloudwatch-alarm demo, and the project is cloudwatch-alarm.
* The code aws/cloudwatch_alarm_and_slack directory.
* RDS is mysql and the version above 8.0.
* RDS is clutser and just create a writer instance.
* RDS cluster name is cloudwatch-alarm-demo
* RDS storage should be gp3 and encryption should be enabled.
* The lambda functino use python. python version above 3.12
* Create file without approved
* create aws vpc using terraform vpc module.
* rds code at rds.tf. vpc code at vpc.tf. lambda code at lambda.tf. cloudwatch alarm code at cloudwatch_alarm.tf. sns code at sns.tf. slack notification code at slack_notification.tf.
* terraform and python indednt should be 2 spaces.
* output the code to outputs.tf
* create fis code at fis.tf
* sns topic set at-rest encryption enabled
