# ApplyGuardrail은 CloudTrail 데이터 이벤트라 event history에 남지 않는다.
# guardrail 리소스 유형의 데이터 이벤트만 받는 trail을 만들어 S3에 기록한다(시나리오 10)
locals {
  trail_name = "${var.project_name}-guardrail-data-events"
}

resource "aws_s3_bucket" "trail" {
  count = var.enable_guardrail_data_events ? 1 : 0

  bucket_prefix = "${var.project_name}-trail-"
  # 실습용. destroy할 때 로그 파일까지 지운다
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "trail" {
  count = var.enable_guardrail_data_events ? 1 : 0

  bucket                  = aws_s3_bucket.trail[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "trail" {
  count = var.enable_guardrail_data_events ? 1 : 0

  bucket = aws_s3_bucket.trail[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  count = var.enable_guardrail_data_events ? 1 : 0

  bucket = aws_s3_bucket.trail[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 로그는 하루만 보관한다
resource "aws_s3_bucket_lifecycle_configuration" "trail" {
  count = var.enable_guardrail_data_events ? 1 : 0

  bucket = aws_s3_bucket.trail[0].id
  rule {
    id     = "expire-1d"
    status = "Enabled"
    filter {}
    expiration {
      days = 1
    }
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }
}

# CloudTrail 서비스가 이 trail로만 쓰도록 SourceArn으로 좁힌다
data "aws_iam_policy_document" "trail_bucket" {
  count = var.enable_guardrail_data_events ? 1 : 0

  statement {
    sid       = "AclCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.trail[0].arn]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.trail_name}"]
    }
  }

  statement {
    sid       = "Write"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.trail[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.trail_name}"]
    }
  }
}

resource "aws_s3_bucket_policy" "trail" {
  count = var.enable_guardrail_data_events ? 1 : 0

  bucket = aws_s3_bucket.trail[0].id
  policy = data.aws_iam_policy_document.trail_bucket[0].json
}

resource "aws_cloudtrail" "guardrail_data_events" {
  count = var.enable_guardrail_data_events ? 1 : 0

  name           = local.trail_name
  s3_bucket_name = aws_s3_bucket.trail[0].id
  # 이 리전의 guardrail 호출만 받는다
  is_multi_region_trail         = false
  include_global_service_events = false

  # 관리 이벤트는 event history에 이미 있으므로 받지 않고, guardrail 데이터 이벤트만 받는다
  advanced_event_selector {
    name = "Bedrock guardrail data events"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::Bedrock::Guardrail"]
    }
  }

  depends_on = [aws_s3_bucket_policy.trail]
}
