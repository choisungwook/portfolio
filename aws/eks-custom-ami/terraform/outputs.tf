output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = var.eks_cluster_name
}

output "custom_ami_id" {
  description = "The custom AMI ID used for the managed node group"
  value       = var.custom_ami_id
}

output "vpc_id" {
  description = "VPC ID where the resources are deployed"
  value       = data.aws_vpc.default.id
}

output "kubeconfig_command" {
  description = "Command to update kubeconfig"
  value       = "aws eks update-kubeconfig --name ${var.eks_cluster_name} --region ${var.aws_region}"
}
