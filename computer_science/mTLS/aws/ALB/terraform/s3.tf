resource "aws_s3_bucket" "trust_store" {
  bucket = var.trust_store_bucket_name

  tags = {
    Name        = "mtls-trust-store"
    environment = "test"
  }
}

resource "aws_s3_bucket" "crl_store" {
  bucket = "${var.trust_store_bucket_name}-crl"

  tags = {
    Name        = "mtls-crl-store"
    environment = "test"
  }
}

resource "aws_s3_bucket_versioning" "trust_store" {
  bucket = aws_s3_bucket.trust_store.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "crl_store" {
  bucket = aws_s3_bucket.crl_store.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "trust_store" {
  bucket                  = aws_s3_bucket.trust_store.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "crl_store" {
  bucket                  = aws_s3_bucket.crl_store.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Upload CA certificate to S3
resource "aws_s3_object" "ca_cert" {
  bucket = aws_s3_bucket.trust_store.id
  key    = "certs/root_ca.pem"                # S3 path
  source = "${path.module}/certs/root_ca.pem" # Local file path

  # Add etag to detect changes
  etag = md5(file("${path.module}/certs/root_ca.pem"))
}

resource "aws_s3_object" "crl_file" {
  for_each = var.revocation_lists

  bucket       = aws_s3_bucket.crl_store.id
  key          = each.value.revocations_s3_key
  source       = "${path.module}/certs/${basename(each.value.revocations_s3_key)}"
  content_type = "application/pkix-crl"

  # Add etag to detect changes
  etag = md5(file("${path.module}/certs/${basename(each.value.revocations_s3_key)}"))
}
