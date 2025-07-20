resource "aws_s3_bucket" "akbun_airbyte_source" {
  bucket = "akbun-airbyte-source-${random_id.bucket_suffix.hex}"

  tags = {
    Name        = "akbun-airbyte-source"
    Environment = "dev"
    Project     = "airbyte-practice"
  }
}

resource "aws_s3_bucket_public_access_block" "akbun_airbyte_source" {
  bucket = aws_s3_bucket.akbun_airbyte_source.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}


resource "aws_s3_bucket_versioning" "akbun_airbyte_source" {
  bucket = aws_s3_bucket.akbun_airbyte_source.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "akbun_airbyte_source" {
  bucket = aws_s3_bucket.akbun_airbyte_source.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Sample data files
resource "aws_s3_object" "sample_ecommerce_csv" {
  bucket = aws_s3_bucket.akbun_airbyte_source.bucket
  key    = "sample-data/ecommerce_orders.csv"
  source = "${path.module}/sample-data/ecommerce_orders.csv"
  etag   = filemd5("${path.module}/sample-data/ecommerce_orders.csv")

  tags = {
    Name        = "akbun-sample-ecommerce-data"
    Environment = var.environment
    Project     = var.project_name
  }
}
