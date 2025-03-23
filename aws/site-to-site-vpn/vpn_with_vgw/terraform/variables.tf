variable "vpc_onprem_cidr" {
  description = "VPC onprem CIDR (On-Premises Role)"
  type        = string
  default     = "10.10.0.0/16"
}

variable "vpc_cloud_cidr" {
  description = "VPC cloud CIDR (Cloud Role)"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnets_onrpem" {
  description = "VPC onrpem public subnets"
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
  default = {
    "subnet_a1" = {
      cidr = "10.10.10.0/24",
      az   = "ap-northeast-2a",
      tags = {
        Name = "onprem-public-subnet-a1"
      }
    },
    "subnet_a2" = {
      cidr = "10.10.11.0/24",
      az   = "ap-northeast-2c",
      tags = {
        Name = "onprem-public-subnet-a2"
      }
    }
  }
}

variable "private_subnets_onprem" {
  description = "VPC onprem private subnets"
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
  default = {
    "subnet_a1" = {
      cidr = "10.10.100.0/24",
      az   = "ap-northeast-2a",
      tags = {
        Name = "onprem-private-subnet-a1"
      }
    },
    "subnet_a2" = {
      cidr = "10.10.101.0/24",
      az   = "ap-northeast-2c",
      tags = {
        Name = "onprem-private-subnet-a2"
      }
    }
  }
}

variable "public_subnets_cloud" {
  description = "VPC cloud public subnets"
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
  default = {
    "subnet_b1" = {
      cidr = "10.20.10.0/24",
      az   = "ap-northeast-2a",
      tags = {
        Name = "cloud-public-subnet-b1"
      }
    },
    "subnet_b2" = {
      cidr = "10.20.11.0/24",
      az   = "ap-northeast-2c",
      tags = {
        Name = "cloud-public-subnet-b2"
      }
    }
  }
}

variable "private_subnets_cloud" {
  description = "VPC cloud private subnets"
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
  default = {
    "subnet_b1" = {
      cidr = "10.20.100.0/24",
      az   = "ap-northeast-2a",
      tags = {
        Name = "cloud-private-subnet-b1"
      }
    },
    "subnet_b2" = {
      cidr = "10.20.101.0/24",
      az   = "ap-northeast-2c",
      tags = {
        Name = "cloud-private-subnet-b2"
      }
    }
  }
}
