output "kubeconfig_command" {
  description = "kubeconfig 갱신 명령"
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.aws_region}"
}
