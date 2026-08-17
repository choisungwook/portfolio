output "documents_bucket_name" {
  description = "S3 bucket that stores source documents for the knowledge base."
  value       = aws_s3_bucket.documents.bucket
}

output "sample_document_s3_uri" {
  description = "Sample product catalog document uploaded for ingestion."
  value       = "s3://${aws_s3_bucket.documents.bucket}/${aws_s3_object.sample_products.key}"
}

output "vector_bucket_arn" {
  description = "S3 Vectors bucket ARN."
  value       = aws_s3vectors_vector_bucket.vectors.vector_bucket_arn
}

output "vector_index_arn" {
  description = "S3 Vectors index ARN."
  value       = aws_s3vectors_index.bedrock.index_arn
}

output "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID."
  value       = aws_bedrockagent_knowledge_base.rag.id
}

output "data_source_id" {
  description = "Bedrock Knowledge Base data source ID."
  value       = aws_bedrockagent_data_source.s3_products.data_source_id
}

output "generation_model_arn" {
  description = "Default model ARN for RetrieveAndGenerate tests."
  value       = "arn:${data.aws_partition.current.partition}:bedrock:${var.aws_region}::foundation-model/${var.generation_model_id}"
}

output "start_ingestion_command" {
  description = "Command to sync S3 documents into the knowledge base."
  value       = "aws bedrock-agent start-ingestion-job --knowledge-base-id ${aws_bedrockagent_knowledge_base.rag.id} --data-source-id ${aws_bedrockagent_data_source.s3_products.data_source_id} --region ${var.aws_region}"
}
