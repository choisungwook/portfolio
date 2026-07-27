variable "project_name" {
  description = "Name prefix for every resource."
  type        = string
  default     = "asymmetric-routing"
}

variable "aws_region" {
  description = "Region to build the lab in."
  type        = string
  default     = "ap-northeast-2"
}

variable "instance_type" {
  description = "Instance type for the three lab hosts."
  type        = string
  default     = "t4g.small"
}

variable "arch" {
  description = "CPU architecture. Must match instance_type."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "arch must be arm64 or x86_64."
  }
}

variable "ebs_size" {
  description = "Root volume size in GB."
  type        = number
  default     = 30
}

variable "forward_path" {
  description = <<-EOT
    How the client VPC reaches the server VPC.
      direct - straight over the peering connection. The server has no route
               back to 10.0.0.0/16, so the return path is a black hole.
      pnat   - through a private NAT gateway, so the source becomes an address
               the server VPC does route back.
  EOT
  type        = string
  default     = "direct"

  validation {
    condition     = contains(["direct", "pnat"], var.forward_path)
    error_message = "forward_path must be direct or pnat."
  }
}

variable "vpc_a_cidr" {
  description = "Primary CIDR of the client VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_a_secondary_cidr" {
  description = "Secondary CIDR of the client VPC. RFC 6598 space holds the private NAT gateway."
  type        = string
  default     = "100.64.0.0/16"
}

variable "vpc_b_cidr" {
  description = "CIDR of the server VPC."
  type        = string
  default     = "10.1.0.0/16"
}
