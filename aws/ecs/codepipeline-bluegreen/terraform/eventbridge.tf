# ECR source action은 polling이 없다. push 이벤트를 EventBridge가 받아 파이프라인을 깨운다.
resource "aws_cloudwatch_event_rule" "ecr_push" {
  name        = "${var.project_name}-ecr-push"
  description = "Start the image pipeline when the latest tag is pushed"

  event_pattern = jsonencode({
    source      = ["aws.ecr"]
    detail-type = ["ECR Image Action"]
    detail = {
      action-type     = ["PUSH"]
      result          = ["SUCCESS"]
      repository-name = [aws_ecr_repository.web.name]
      image-tag       = ["latest"]
    }
  })
}

resource "aws_cloudwatch_event_target" "ecr_push" {
  rule     = aws_cloudwatch_event_rule.ecr_push.name
  arn      = aws_codepipeline.image.arn
  role_arn = aws_iam_role.events.arn
}

resource "aws_cloudwatch_event_rule" "config_upload" {
  name        = "${var.project_name}-config-upload"
  description = "Start the config pipeline when config.zip is uploaded"

  event_pattern = jsonencode({
    source      = ["aws.s3"]
    detail-type = ["Object Created"]
    detail = {
      bucket = { name = [aws_s3_bucket.config.bucket] }
      object = { key = [var.config_object_key] }
    }
  })
}

resource "aws_cloudwatch_event_target" "config_upload" {
  rule     = aws_cloudwatch_event_rule.config_upload.name
  arn      = aws_codepipeline.config.arn
  role_arn = aws_iam_role.events.arn
}
