resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "origin" {
  bucket = "${var.project_name}-origin-${random_id.suffix.hex}"
}

resource "aws_s3_bucket_versioning" "origin" {
  bucket = aws_s3_bucket.origin.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "origin" {
  bucket = aws_s3_bucket.origin.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "origin" {
  bucket = aws_s3_bucket.origin.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "max_age" {
  bucket        = aws_s3_bucket.origin.id
  key           = "max-age.html"
  source        = "${path.module}/../s3-objects/max-age.html"
  content_type  = "text/html"
  cache_control = "public, max-age=60"
  etag          = filemd5("${path.module}/../s3-objects/max-age.html")
}

resource "aws_s3_object" "s_maxage" {
  bucket        = aws_s3_bucket.origin.id
  key           = "s-maxage.html"
  source        = "${path.module}/../s3-objects/s-maxage.html"
  content_type  = "text/html"
  cache_control = "public, s-maxage=60, max-age=0"
  etag          = filemd5("${path.module}/../s3-objects/s-maxage.html")
}

resource "aws_s3_object" "no_cache" {
  bucket        = aws_s3_bucket.origin.id
  key           = "no-cache.html"
  source        = "${path.module}/../s3-objects/no-cache.html"
  content_type  = "text/html"
  cache_control = "no-cache"
  etag          = filemd5("${path.module}/../s3-objects/no-cache.html")
}

resource "aws_s3_object" "no_store" {
  bucket        = aws_s3_bucket.origin.id
  key           = "no-store.html"
  source        = "${path.module}/../s3-objects/no-store.html"
  content_type  = "text/html"
  cache_control = "no-store"
  etag          = filemd5("${path.module}/../s3-objects/no-store.html")
}

resource "aws_s3_object" "private" {
  bucket        = aws_s3_bucket.origin.id
  key           = "private.html"
  source        = "${path.module}/../s3-objects/private.html"
  content_type  = "text/html"
  cache_control = "private, max-age=60"
  etag          = filemd5("${path.module}/../s3-objects/private.html")
}
