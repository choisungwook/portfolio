# 계정 3개를 AWS CLI profile로 구분한다. 한 번의 apply로 세 계정에 리소스를 만든다.
provider "aws" {
  alias   = "monitoring"
  region  = var.aws_region
  profile = var.monitoring_profile

  default_tags {
    tags = {
      ManagedBy = "Terraform"
      Project   = var.project_name
      Account   = "monitoring"
    }
  }
}

provider "aws" {
  alias   = "dev"
  region  = var.aws_region
  profile = var.dev_profile

  default_tags {
    tags = {
      ManagedBy = "Terraform"
      Project   = var.project_name
      Account   = "dev"
    }
  }
}

provider "aws" {
  alias   = "prod"
  region  = var.aws_region
  profile = var.prod_profile

  default_tags {
    tags = {
      ManagedBy = "Terraform"
      Project   = var.project_name
      Account   = "prod"
    }
  }
}
