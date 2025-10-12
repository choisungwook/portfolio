# Overview

* This project is to know about AWS ASG with Goployer opensource. Goployer is to deploy an EC2 instance using AWS ASG.
* You can find the goployer code on GitHub here: https://github.com/DevopsArtFactory/goployer

## Architecture

* EC2 instances integrate an Auto Scaling group and ALB.
* When I deploy a new instance, I create a new Auto Scaling group. The Auto Scaling group integrates ALB. Then, the new instances in the Auto Scaling group are healthy, and ALB is deregistering the old instance. During deregistration in ALB, the client only connects to a new instance. An application instance already has a graceful shutdown.

## Scenarioes

1. Scenario is that I manually operate the process. I will create an ALB and an autoscaling group. I manually integrate the ALB and the instance.

## Requiremnets

* I use ap-northeast-2 AWS region.
* indent must be 2.
* terraform
  * EC2 instnace
    * Install nginx in the user data.
    * EBS is gp3 and encryption is enabled. Volume size is 30GB.
    * instance spec is a t4g.small
  * AWS common resources tags.
    * Name: goployer-example
    * Project: practice
    * Environment: poc
  * I use Terraform. Terraform is located in the ./terraform directory.
  * Terraform structure
    * provider.tf
    * variables.tf
    * terraform.tfvars
    * ec2.tf(with ASG, Security group, IAM)
      * ASG does not connect to ALB, just create it. Because I manually integrate ASG to ALB
    * alb.tf(with Security group)
  * ALB security group is open 80/tcp from any. The EC2 security group is only from the ALB security group. You should use a security group ingress rule resource in Terraform.
  * VPC
    * I use the default VPC in ap-northeast2. Use data resources for VPC, public subnets, and private subnets.
    * EC2 instance(or ASG) is in public subnet. because I don't have a lot of money. So I just launched an EC2 instance to study my goals. but, The EC2 instance can only accept from ALB(security group).
    * ALB is in the public subnet.
* goployer
  * EBS
    * size is 30GB
    * encryption is enabled
    * use gp3 type
  * EC2
    * t4g.small
    * install nginx in userdata

## guardrails

* Don't use the command below
  * terraform apply
  * goployer (run)
