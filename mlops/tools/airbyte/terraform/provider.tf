terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-2" # Seoul region
}

provider "google" {
  credentials = file("~/.gcp/cred.json")
  project     = var.gcp_project_id
  region      = "asia-northeast3" # Seoul region
}
