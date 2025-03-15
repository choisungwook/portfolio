variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "ec2_name" {
  description = "Name of the EC2 instance"
  type        = string
}

variable "ec2_instance_type" {
  description = "Instance type of the EC2 instance"
  type        = string
  default     = "t3.medium"
}

variable "subnet_id" {
  description = "Subnet ID"
  type        = string
}
