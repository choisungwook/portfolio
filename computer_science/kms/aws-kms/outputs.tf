output "kms_key_id" {
  description = "KMS key ID"
  value       = aws_kms_key.symmetric.key_id
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = aws_kms_key.symmetric.arn
}

output "kms_alias_name" {
  description = "KMS key alias name"
  value       = aws_kms_alias.symmetric.name
}

output "s3_bucket_name" {
  description = "KMS-encrypted S3 bucket name"
  value       = aws_s3_bucket.encrypted.id
}
