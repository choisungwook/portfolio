resource "aws_ecr_repository" "agent" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}
