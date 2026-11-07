output "app_url" {
  value = "http://${aws_instance.app.public_ip}:${var.app_port}"
}

output "instance_id" {
  value = aws_instance.app.id
}

output "cluster_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "cluster_resource_id" {
  value = aws_rds_cluster.aurora.cluster_resource_id
}

output "master_secret_arn" {
  value = aws_rds_cluster.aurora.master_user_secret[0].secret_arn
}

output "auth_mode_param" {
  value = aws_ssm_parameter.auth_mode.name
}

output "app_status_check_id" {
  value = awscc_ec2_application_status_check.app.application_status_check_id
}

output "allowed_cidrs" {
  value = local.allowed_cidrs
}
