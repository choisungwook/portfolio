# 자격 증명은 셸의 AWS_PROFILE(없으면 default) 등 기본 credential chain을 따른다
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy = "Terraform"
      Project   = var.project_name
    }
  }
}
