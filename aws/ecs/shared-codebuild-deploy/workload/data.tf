data "terraform_remote_state" "foundation" {
  backend = "local"

  config = {
    path = abspath("${path.module}/${var.foundation_state_path}")
  }
}

data "aws_ecr_image" "bootstrap" {
  repository_name = local.lab.repository_name
  image_tag       = var.bootstrap_image_tag
}
