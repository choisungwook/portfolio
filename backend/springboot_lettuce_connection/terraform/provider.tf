terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.75.0"
    }
  }

  required_version = ">= 1.5"
}

provider "aws" {
  region = "ap-northeast-2"
  assume_role {
    role_arn = var.assume_role_arn
  }
}
