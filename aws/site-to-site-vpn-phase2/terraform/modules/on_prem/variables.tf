variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
}

variable "onprem_vpc_cidr" {
  description = "CIDR block for the onprem VPC"
  type        = string
}

variable "onprem_public_subnets" {
  description = "Public subnets for the onprem VPC"
  type        = list(string)
}

variable "onprem_private_subnets" {
  description = "Private subnets for the onprem VPC"
  type        = list(string)
}

variable "cloud_vpc_cidr" {
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

variable "onprem_nginx" {
  description = "Configuration for the onprem nginx EC2 instance"
  type = object({
    ami_id        = string
    instance_type = string
    volume_size   = number
  })
}
