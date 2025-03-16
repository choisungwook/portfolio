variable "vpc_tag" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "public_subnets" {
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
}

variable "private_subnets" {
  type = map(object({
    cidr = string
    az   = string
    tags = map(string)
  }))
}
