resource "aws_ecr_lifecycle_policy" "this" {
  count      = var.enable_lifecycle_policy ? 1 : 0
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = concat(
      var.enable_prod_guard_rule ? [
        {
          rulePriority = 1
          description  = "Guard prod v* images from lower priority dev cleanup"
          selection = {
            tagStatus     = "tagged"
            tagPrefixList = ["v"]
            countType     = "imageCountMoreThan"
            countNumber   = var.prod_guard_image_count
          }
          action = {
            type = "expire"
          }
        }
      ] : [],
      [
        {
          rulePriority = var.enable_prod_guard_rule ? 2 : 1
          description  = "Keep latest d* dev images"
          selection = {
            tagStatus     = "tagged"
            tagPrefixList = ["d"]
            countType     = "imageCountMoreThan"
            countNumber   = var.dev_image_count
          }
          action = {
            type = "expire"
          }
        }
      ]
    )
  })
}
