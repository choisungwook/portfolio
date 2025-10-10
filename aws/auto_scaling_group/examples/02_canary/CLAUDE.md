# Overview

* This project is to practice AWS Auto Scaling Group strategy.

## Scenarioes

* scneario is a Canary Update. I think this strategy is default config of ASG. I want to set options like MinHealthyPercentage, etc

## Requiremnets

* I use ap-northeast-2 AWS region.
* A indent must be 2.
* terraform
  * EC2 instnace
    * install nginx in user data.
    * EBS is gp3 and encrytpoin is enabled. volume size is 30GB.
    * instance spec is a t4g.small
  * AWS common resources tags.
    * Name: goployer-example
    * Project: practice
    * Environment: poc
  * terraform structure
    * provider.tf
    * variables.tf
    * terraform.tfvars
    * ec2.tf(with ASG, Security group, IAM)
      * ASG does not connect to ALB just create it. becuase I manually intergrate ASG to ALB
    * alb.tf(with Security group)
  * ALB security group is open 80/tcp from any. and EC2 security group is only from ALB security group. probably you should security group ingress rule resource of terraform.
  * VPC
    * I use default VPC in ap-northeast2. use data resoureces to VPC, public subnets, private subnets.
    * EC2 instance(or ASG) is in public subnet. becuase I don't have a mony lot. so I just launch EC2 instance to study my goals. but, The EC2 instance can only accept from ALB(security group).
    * ALB is in public subnet.
* goployer
  * EBS
    * size is 30GB
    * encryption is enabled
    * use gp3 type
  * EC2
    * t4g.small
    * install nginx in userdata

## guardrails

* Don't use command below
  * terraform apply

## instructions(What I want to)

* create terraform in current directory
* create thress ASG and each ASG configurations. but just use one ALB. I manlly integrate ALB to ASG. Each ASG have a userdata. and the userdata is not exist file just in terraform code.
