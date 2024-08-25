variable "eks_cluster_name" {
  type = string
}

variable "assume_role_arn" {
  type = string
}

variable "enable_amp" {
  type    = bool
  default = false
}

variable "eks_addon_kube_proxy_version" {
  type = string
}

variable "eks_addon_vpc_cni_version" {
  type = string
}

variable "eks_addon_coredns_version" {
  type = string
}
