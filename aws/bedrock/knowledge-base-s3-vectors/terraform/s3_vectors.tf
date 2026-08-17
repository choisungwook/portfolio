resource "aws_s3vectors_vector_bucket" "vectors" {
  vector_bucket_name = var.vector_bucket_name != null ? var.vector_bucket_name : "${var.bucket_prefix}-vectors-${random_id.bucket_suffix.hex}"
  force_destroy      = true

  tags = {
    Name = var.vector_bucket_name != null ? var.vector_bucket_name : "${var.bucket_prefix}-vectors-${random_id.bucket_suffix.hex}"
  }
}

resource "aws_s3vectors_index" "bedrock" {
  vector_bucket_name = aws_s3vectors_vector_bucket.vectors.vector_bucket_name
  index_name         = var.vector_index_name
  data_type          = "float32"
  dimension          = var.embedding_dimensions
  distance_metric    = "cosine"

  metadata_configuration {
    non_filterable_metadata_keys = var.non_filterable_metadata_keys
  }

  tags = {
    Name = var.vector_index_name
  }
}

resource "aws_s3vectors_vector_bucket_policy" "bedrock" {
  vector_bucket_arn = aws_s3vectors_vector_bucket.vectors.vector_bucket_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBedrockKnowledgeBaseVectorBucketAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = [
          "s3vectors:GetVectorBucket",
          "s3vectors:ListIndexes"
        ]
        Resource = aws_s3vectors_vector_bucket.vectors.vector_bucket_arn
        Condition = {
          ArnEquals = {
            "aws:PrincipalArn" = aws_iam_role.bedrock_knowledge_base.arn
          }
        }
      },
      {
        Sid    = "AllowBedrockKnowledgeBaseVectorIndexAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = [
          "s3vectors:PutVectors",
          "s3vectors:GetVectors",
          "s3vectors:DeleteVectors",
          "s3vectors:QueryVectors",
          "s3vectors:GetIndex"
        ]
        Resource = "${aws_s3vectors_vector_bucket.vectors.vector_bucket_arn}/*"
        Condition = {
          ArnEquals = {
            "aws:PrincipalArn" = aws_iam_role.bedrock_knowledge_base.arn
          }
        }
      }
    ]
  })
}
