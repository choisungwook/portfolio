# 폐쇄망 EC2는 ghcr.io에 못 나간다. 로컬에서 받은 LiteLLM 이미지를 여기에 push해 공급한다.
resource "aws_ecr_repository" "litellm" {
  name                 = "${var.project_name}/litellm"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-litellm"
  }
}
