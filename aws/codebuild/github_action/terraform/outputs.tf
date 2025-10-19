output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "nexus_instance_id" {
  description = "Nexus EC2 instance ID"
  value       = module.nexus.nexus_instance_id
}

output "nexus_private_ip" {
  description = "Nexus EC2 private IP"
  value       = module.nexus.nexus_private_ip
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.nexus.alb_dns_name
}

output "nexus_url" {
  description = "Nexus URL"
  value       = module.nexus.nexus_url
}

output "nexus_internal_url" {
  description = "Nexus internal URL for CodeBuild"
  value       = module.nexus.nexus_internal_url
}

output "private_alb_dns_name" {
  description = "Private ALB DNS name"
  value       = module.nexus.private_alb_dns_name
}

output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = aws_codebuild_project.github_action.name
}

output "codebuild_project_arn" {
  description = "CodeBuild project ARN"
  value       = aws_codebuild_project.github_action.arn
}

output "codebuild_role_arn" {
  description = "CodeBuild IAM role ARN"
  value       = aws_iam_role.codebuild.arn
}
