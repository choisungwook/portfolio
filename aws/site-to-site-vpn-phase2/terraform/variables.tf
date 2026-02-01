variable "project_name" {
  description = "Project name"
  type        = string
}

variable "aws_region" {
  description = "AWS Region"
  type        = string
}

variable "cloud_vpc_cidr" {
  description = "CIDR block for the AWS Cloud VPC"
  type        = string
}

variable "onprem_vpc_cidr" {
  description = "CIDR block for the onprem VPC"
  type        = string
}

variable "cloud_private_subnets" {
  description = "Private subnets for the AWS Cloud VPC"
  type        = list(string)
}

variable "cloud_public_subnets" {
  description = "Public subnets for the AWS Cloud VPC"
  type        = list(string)
}

variable "onprem_private_subnets" {
  description = "Private subnets for the onprem VPC"
  type        = list(string)
}

variable "onprem_public_subnets" {
  description = "Public subnets for the onprem VPC"
  type        = list(string)
}

variable "cloud_ec2" {
  description = "Configuration for the AWS Cloud EC2 instance"
  type = object({
    instance_type = string
    volume_size   = number
  })
}

variable "onprem_ec2" {
  description = "Configuration for the onprem EC2 instances (VPN appliance, internal server)"
  type = object({
    instance_type = string
    volume_size   = number
  })
}

variable "onprem_nginx" {
  description = "Configuration for the onprem nginx EC2 instance"
  type = object({
    instance_type = string
    volume_size   = number
  })
}
