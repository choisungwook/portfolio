output "cluster_name" {
  description = "EKS cluster name."
  value       = var.eks_cluster_name
}

output "aws_region" {
  description = "AWS Region."
  value       = var.aws_region
}

output "vpc_id" {
  description = "Default VPC ID used by this hands-on."
  value       = data.aws_vpc.default.id
}

output "default_subnet_ids" {
  description = "Default subnet IDs used by this hands-on."
  value       = data.aws_subnets.default.ids
}

output "update_kubeconfig_command" {
  description = "Command to configure kubectl for the EKS cluster."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${var.eks_cluster_name}"
}
