variable "project_name" {
  description = "Project name"
  type        = string
}

variable "aws_region" {
  description = "AWS Region"
  type        = string
}

variable "aws_cloud_vpc_cidr" {
  description = "CIDR block for the AWS Cloud VPC"
  type        = string
}

variable "on_prem_vpc_cidr" {
  description = "CIDR block for the on-prem VPC"
  type        = string
}

variable "aws_cloud_private_subnets" {
  description = "Private subnets for the AWS Cloud VPC"
  type        = list(string)
}

variable "aws_cloud_public_subnets" {
  description = "Public subnets for the AWS Cloud VPC"
  type        = list(string)
}

variable "on_prem_private_subnets" {
  description = "Private subnets for the on-prem VPC"
  type        = list(string)
}

variable "on_prem_public_subnets" {
  description = "Public subnets for the on-prem VPC"
  type        = list(string)
}

variable "aws_cloud_ec2_volume_size" {
  description = "EBS gp3 volume size for AWS Cloud EC2 instances"
  type        = number
}

variable "on_prem_ec2_volume_size" {
  description = "EBS gp3 volume size for on-prem EC2 instances"
  type        = number
}

variable "aws_cloud_instance_type" {
  description = "Instance type for the AWS Cloud EC2 instance"
  type        = string
}

variable "on_prem_instance_type" {
  description = "Instance type for the on-prem EC2 instance"
  type        = string
}
