provider "aws" {
  region = local.lab.aws_region

  default_tags {
    tags = {
      ManagedBy = "Terraform"
      Project   = local.lab.project_name
    }
  }
}
