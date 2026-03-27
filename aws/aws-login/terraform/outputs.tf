data "aws_caller_identity" "current" {}

output "iam_user_name" {
  description = "IAM user name"
  value       = aws_iam_user.this.name
}

output "iam_user_arn" {
  description = "IAM user ARN"
  value       = aws_iam_user.this.arn
}

output "console_login_url" {
  description = "AWS console login URL"
  value       = "https://${data.aws_caller_identity.current.account_id}.signin.aws.amazon.com/console"
}

output "aws_login_command" {
  description = "Command to run aws login"
  value       = "aws login --profile ${var.iam_username}"
}
