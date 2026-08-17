variable "aws_region" {
  description = "AWS region for the Bedrock RAG hands-on."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging."
  type        = string
  default     = "bedrock-rag"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-32 characters and use lowercase letters, numbers, and hyphens."
  }
}

variable "bucket_prefix" {
  description = "Prefix for generated S3 bucket names. Must start with bedrock- for this hands-on."
  type        = string
  default     = "bedrock-rag"

  validation {
    condition     = can(regex("^bedrock-[a-z0-9-]{1,40}[a-z0-9]$", var.bucket_prefix))
    error_message = "bucket_prefix must start with bedrock- and use lowercase letters, numbers, and hyphens."
  }
}

variable "data_bucket_name" {
  description = "Optional globally unique S3 bucket name for source documents. Leave null to generate one with a random suffix."
  type        = string
  default     = null

  validation {
    condition     = var.data_bucket_name == null || can(regex("^bedrock-[a-z0-9.-]{1,54}[a-z0-9]$", var.data_bucket_name))
    error_message = "data_bucket_name must be null or start with bedrock-."
  }
}

variable "vector_bucket_name" {
  description = "Optional S3 Vectors bucket name. Leave null to generate one with a random suffix."
  type        = string
  default     = null

  validation {
    condition     = var.vector_bucket_name == null || can(regex("^bedrock-[a-z0-9.-]{1,54}[a-z0-9]$", var.vector_bucket_name))
    error_message = "vector_bucket_name must be null or start with bedrock-."
  }
}

variable "vector_index_name" {
  description = "S3 Vectors index name used by Bedrock Knowledge Bases."
  type        = string
  default     = "bedrock-rag-index"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.vector_index_name))
    error_message = "vector_index_name must be 3-63 characters and use lowercase letters, numbers, hyphens, or dots."
  }
}

variable "non_filterable_metadata_keys" {
  description = "S3 Vectors metadata keys that Bedrock Knowledge Bases stores for retrieval context, not query filters."
  type        = list(string)
  default = [
    "AMAZON_BEDROCK_TEXT",
    "AMAZON_BEDROCK_METADATA",
  ]

  validation {
    condition     = length(var.non_filterable_metadata_keys) <= 10
    error_message = "non_filterable_metadata_keys must contain at most 10 keys for S3 Vectors."
  }
}

variable "embedding_model_id" {
  description = "Bedrock embedding model ID."
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "embedding_dimensions" {
  description = "Vector dimensions. Titan Text Embeddings V2 supports 1024, 512, and 256."
  type        = number
  default     = 1024

  validation {
    condition     = contains([1024, 512, 256], var.embedding_dimensions)
    error_message = "embedding_dimensions must be 1024, 512, or 256 for Titan Text Embeddings V2."
  }
}

variable "generation_model_id" {
  description = "Default model ID for RetrieveAndGenerate tests."
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "sample_document_key" {
  description = "S3 object key for the sample product catalog document."
  type        = string
  default     = "documents/products.md"
}

variable "chunk_max_tokens" {
  description = "Maximum tokens for fixed-size Knowledge Base chunking."
  type        = number
  default     = 300
}

variable "chunk_overlap_percentage" {
  description = "Overlap percentage for fixed-size Knowledge Base chunking."
  type        = number
  default     = 20
}
