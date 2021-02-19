variable "az" {
  type        = list(string)
  default     = [
      "ap-northeast-2a",
      "ap-northeast-2c"
  ]
  description = "seoul region az"
}

variable "public_subnet" {
  type        = list(string)
  default     = [
    "10.0.0.0/24",
    "10.0.1.0/24"
  ]

  description = "demo public subnet"
}

variable "private_subnet" {
  type        = list(string)
  default     = [
    "10.0.2.0/24",
    "10.0.3.0/24"
  ]
  description = "demo private subnet"
}
