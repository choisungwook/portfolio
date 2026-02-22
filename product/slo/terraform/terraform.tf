terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    key          = "slo-calculator/terraform.tfstate"
    region       = "ap-northeast-2"
    use_lockfile = true
  }
}
