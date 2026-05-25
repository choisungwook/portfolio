output "cluster_name" {
  description = "EKS cluster name."
  value       = var.eks_cluster_name
}

output "aws_region" {
  description = "AWS Region."
  value       = var.aws_region
}

output "default_vpc_id" {
  description = "Default VPC ID used by this hands-on."
  value       = data.aws_vpc.default.id
}

output "default_subnet_ids" {
  description = "Default subnet IDs used by this hands-on."
  value       = data.aws_subnets.default.ids
}

output "artifact_bucket_name" {
  description = "S3 bucket backing S3 Files."
  value       = aws_s3_bucket.artifacts.id
}

output "s3files_file_system_id" {
  description = "S3 Files file system ID for Kubernetes PV volumeHandle."
  value       = aws_s3files_file_system.artifacts.id
}

output "s3files_access_point_id" {
  description = "S3 Files access point ID for the shared read-only artifacts Kubernetes PV volumeHandle."
  value       = aws_s3files_access_point.artifacts.id
}

output "s3files_model_assets_access_point_id" {
  description = "S3 Files access point ID for the writable model assets Kubernetes PV volumeHandle."
  value       = aws_s3files_access_point.model_assets.id
}

output "s3files_mount_target_security_group_id" {
  description = "Security group attached to S3 Files mount targets."
  value       = aws_security_group.s3files_mount_target.id
}

output "alb_controller_role_arn" {
  description = "App-prefixed IRSA role ARN for AWS Load Balancer Controller."
  value       = aws_iam_role.alb_controller.arn
}

output "update_kubeconfig_command" {
  description = "Command to configure kubectl for the EKS cluster."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${var.eks_cluster_name}"
}
