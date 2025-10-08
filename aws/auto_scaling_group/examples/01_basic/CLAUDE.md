# Overview

* This project is to know about AWS ASG.

## Architecture

* EC2 instances intergrate a Auto Scaling group and ALB.
* When I deploy new instance, I create a new Auto Scaling group. The Auto Scaling group integrate ALB. then new instances in Auto scaling group is healthy, ALB is deregistering old instance. during deregistering in ALB, the client only connect to new instnace. A application in instance alreay have a graceshtudown.

## Scenarioes

1. Scneario is that I manullay operate process. I will create ALB and autoscaling group. I manually intergrate ALB and instnace.

## Requiremnets

* I use ap-northeast-2 AWS region.
* indent must be 2.
* terraform
  * EC2 instnace
    * install nginx in user data.
    * EBS is gp3 and encrytpoin is enabled. volume size is 30GB.
    * instance spec is a t4g.nano
  * AWS common resources tags.
    * Name: example1
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

## guardrails

* Don't use command below
  * terraform apply
  * goployer (run)

## instructions(What I want to)

* create terraform in current directory
* create goployer manifests. The goployer uses ALB which is created by terraform.
