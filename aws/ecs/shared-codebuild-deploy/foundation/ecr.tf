resource "aws_ecr_repository" "hello_images" {
  name                 = "${var.project_name}-hello"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}
