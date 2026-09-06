variable "project_name" { type = string }
variable "vpc_id" { type = string }
variable "subnets" { type = map(string) }
variable "client_cidrs" { type = set(string) }
variable "trusted_principal_arn" { type = string }
