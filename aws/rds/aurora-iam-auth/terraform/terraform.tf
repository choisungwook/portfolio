terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.72"
    }
    # EC2 application status check는 hashicorp/aws에 아직 없어 Cloud Control(awscc)로 만든다.
    awscc = {
      source  = "hashicorp/awscc"
      version = "~> 1.109"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }
}
