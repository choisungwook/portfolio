output "kubeconfig_command" {
  description = "kubeconfig 갱신 명령"
  value       = "aws eks update-kubeconfig --name ${var.eks_cluster_name} --region ${var.aws_region}"
}

output "node_instance_ids_command" {
  description = "노드 인스턴스 ID 조회 명령"
  value       = "aws ec2 describe-instances --region ${var.aws_region} --filters Name=tag:eks:nodegroup-name,Values=bottlerocket Name=instance-state-name,Values=running --query 'Reservations[].Instances[].InstanceId' --output text"
}

output "bottlerocket_settings" {
  description = "launch template에 넣은 TOML. EKS가 병합하기 전의 원본"
  value       = local.bottlerocket_settings
}
