# AWS KMS 키 생성
# 대칭(Symmetric) 키: 암호화/복호화에 같은 키를 사용
resource "aws_kms_key" "symmetric" {
  description             = "${var.project_name} symmetric encryption key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  rotation_period_in_days = 90

  tags = {
    Name = "${var.project_name}-symmetric-key"
  }
}

# KMS 키 별칭(Alias): 키 ID 대신 사람이 읽기 쉬운 이름으로 참조
resource "aws_kms_alias" "symmetric" {
  name          = "alias/${var.project_name}-symmetric"
  target_key_id = aws_kms_key.symmetric.key_id
}

# S3 버킷 암호화에 KMS 키 사용하는 예제
resource "aws_s3_bucket" "encrypted" {
  bucket = "${var.project_name}-encrypted-data"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "encrypted" {
  bucket = aws_s3_bucket.encrypted.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.symmetric.arn
    }
  }
}

resource "aws_s3_bucket_versioning" "encrypted" {
  bucket = aws_s3_bucket.encrypted.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "encrypted" {
  bucket = aws_s3_bucket.encrypted.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
