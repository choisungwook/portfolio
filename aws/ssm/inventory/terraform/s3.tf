resource "aws_s3_bucket" "inventory_sync" {
  bucket        = "${var.project_name}-sync-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "inventory_sync" {
  bucket = aws_s3_bucket.inventory_sync.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "inventory_sync" {
  bucket = aws_s3_bucket.inventory_sync.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "inventory_sync" {
  bucket                  = aws_s3_bucket.inventory_sync.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Resource data sync가 버킷에 쓰려면 ssm.amazonaws.com에 권한을 줘야 한다.
data "aws_iam_policy_document" "inventory_sync" {
  statement {
    sid       = "SSMBucketPermissionsCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.inventory_sync.arn]

    principals {
      type        = "Service"
      identifiers = ["ssm.amazonaws.com"]
    }
  }

  statement {
    sid       = "SSMBucketDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.inventory_sync.arn}/*/accountid=${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["ssm.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:ssm:*:${data.aws_caller_identity.current.account_id}:resource-data-sync/*"]
    }
  }
}

resource "aws_s3_bucket_policy" "inventory_sync" {
  bucket = aws_s3_bucket.inventory_sync.id
  policy = data.aws_iam_policy_document.inventory_sync.json

  depends_on = [aws_s3_bucket_public_access_block.inventory_sync]
}
