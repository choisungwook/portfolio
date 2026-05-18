resource "aws_bedrockagent_knowledge_base" "rag" {
  name     = "${var.project_name}-kb"
  role_arn = aws_iam_role.bedrock_knowledge_base.arn

  knowledge_base_configuration {
    type = "VECTOR"

    vector_knowledge_base_configuration {
      embedding_model_arn = "arn:${data.aws_partition.current.partition}:bedrock:${var.aws_region}::foundation-model/${var.embedding_model_id}"

      embedding_model_configuration {
        bedrock_embedding_model_configuration {
          dimensions          = var.embedding_dimensions
          embedding_data_type = "FLOAT32"
        }
      }
    }
  }

  storage_configuration {
    type = "S3_VECTORS"

    s3_vectors_configuration {
      index_arn = aws_s3vectors_index.bedrock.index_arn
    }
  }

  depends_on = [
    aws_iam_role_policy.bedrock_knowledge_base,
    aws_s3vectors_vector_bucket_policy.bedrock,
  ]
}

resource "aws_bedrockagent_data_source" "s3_products" {
  knowledge_base_id    = aws_bedrockagent_knowledge_base.rag.id
  name                 = "${var.project_name}-s3-products"
  data_deletion_policy = "DELETE"

  data_source_configuration {
    type = "S3"

    s3_configuration {
      bucket_arn = aws_s3_bucket.documents.arn
      inclusion_prefixes = [
        dirname(var.sample_document_key) == "." ? "" : "${dirname(var.sample_document_key)}/"
      ]
    }
  }

  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = "FIXED_SIZE"

      fixed_size_chunking_configuration {
        max_tokens         = var.chunk_max_tokens
        overlap_percentage = var.chunk_overlap_percentage
      }
    }
  }

  depends_on = [
    aws_s3_object.sample_products,
  ]
}
