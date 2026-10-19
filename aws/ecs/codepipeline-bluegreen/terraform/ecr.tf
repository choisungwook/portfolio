# latest tag를 매번 덮어써야 하므로 MUTABLE. 실제 배포는 imageDetail.json에서 읽은 버전 tag로 한다.
resource "aws_ecr_repository" "web" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}
