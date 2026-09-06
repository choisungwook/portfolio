terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.63" }
  }
}
provider "aws" {
  region = "ap-northeast-2"
  default_tags {
    tags = { ManagedBy = "Terraform", Project = var.project_name }
  }
}
