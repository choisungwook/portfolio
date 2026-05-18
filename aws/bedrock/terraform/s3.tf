resource "aws_s3_bucket" "documents" {
  bucket = var.data_bucket_name != null ? var.data_bucket_name : "${var.bucket_prefix}-docs-${random_id.bucket_suffix.hex}"

  tags = {
    Name = var.data_bucket_name != null ? var.data_bucket_name : "${var.bucket_prefix}-docs-${random_id.bucket_suffix.hex}"
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "sample_products" {
  bucket       = aws_s3_bucket.documents.id
  key          = var.sample_document_key
  source       = "${path.module}/../sample-data/products.md"
  content_type = "text/markdown"
  etag         = filemd5("${path.module}/../sample-data/products.md")
}
