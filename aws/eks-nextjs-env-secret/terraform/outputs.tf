output "secret_name" {
  description = "AWS Secrets Manager secret name used by the ExternalSecret manifest."
  value       = aws_secretsmanager_secret.demo.name
}

output "external_secrets_role_arn" {
  description = "IAM role ARN to annotate on the External Secrets Operator service account."
  value       = aws_iam_role.external_secrets.arn
}
