locals {
  repository_name = var.repository_name == null ? var.project_name : var.repository_name
}

