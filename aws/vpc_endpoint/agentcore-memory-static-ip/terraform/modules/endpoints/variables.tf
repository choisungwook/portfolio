variable "project_name" { type = string }
variable "vpc_id" { type = string }
variable "subnets" {
  description = "Seoul AZ name => existing subnet ID."
  type        = map(string)
}
variable "client_cidrs" {
  description = "IPv4 sources allowed to reach the endpoint ENIs directly; empty when only a proxy/NLB SG may."
  type        = set(string)
}
variable "policies" {
  description = "Endpoint policy JSON per service key (sts, memory)."
  type        = map(string)
}
