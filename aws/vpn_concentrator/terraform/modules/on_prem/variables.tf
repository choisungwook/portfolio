variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
}

variable "on_prem_vpc_cidr" {
  description = "CIDR block for the on-prem VPC"
  type        = string
}

variable "on_prem_public_subnets" {
  description = "Public subnets for the on-prem VPC"
  type        = list(string)
}

variable "on_prem_private_subnets" {
  description = "Private subnets for the on-prem VPC"
  type        = list(string)
}

variable "aws_cloud_vpc_cidr" {
  description = "CIDR block for the AWS Cloud VPC for setting up security group"
  type        = string
}

variable "ami_id" {
  description = "AMI ID for the VPN appliance EC2 instance"
  type        = string
}

variable "ec2_volume_size" {
  description = "EBS volume size for the VPN appliance EC2 instance"
  type        = number
}

variable "instance_type" {
  description = "Instance type for the VPN appliance EC2 instance"
  type        = string
}
