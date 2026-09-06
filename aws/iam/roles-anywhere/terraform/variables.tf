variable "project_name" {
  type    = string
  default = "ra-handson"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.project_name))
    error_message = "Use 3-25 lowercase letters, digits or hyphens, beginning with a letter."
  }
}
variable "ca_certificate_path" {
  type    = string
  default = "../runtime/pki/ca/ca.crt"
}
variable "certificate_common_name" {
  type    = string
  default = "memory-client"
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{1,61}$", var.certificate_common_name))
    error_message = "Use a non-empty lab CN of up to 61 letters, digits, underscores or hyphens."
  }
}
