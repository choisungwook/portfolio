variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
}

variable "cloud_vpc_cidr" {
  description = "CIDR block for the AWS Cloud VPC"
  type        = string
}

variable "cloud_public_subnets" {
  description = "Public subnets for the AWS Cloud VPC"
  type        = list(string)
}

variable "cloud_private_subnets" {
  description = "Private subnets for the AWS Cloud VPC"
  type        = list(string)
}

variable "onprem_vpc_cidr" {
  description = "CIDR block for the onprem VPC for setting up security group"
  type        = string
}

variable "ami_id" {
  description = "AMI ID for the test EC2 instance"
  type        = string
}

variable "ec2_volume_size" {
  description = "EBS volume size for the test EC2 instance"
  type        = number
}

variable "instance_type" {
  description = "Instance type for the test EC2 instance"
  type        = string
}
