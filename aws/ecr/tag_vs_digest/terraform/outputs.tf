output "repository_name" {
  description = "ECR repository name."
  value       = aws_ecr_repository.this.name
}

output "repository_url" {
  description = "ECR repository URL."
  value       = aws_ecr_repository.this.repository_url
}

output "registry_id" {
  description = "AWS account ID that owns the ECR repository."
  value       = aws_ecr_repository.this.registry_id
}

