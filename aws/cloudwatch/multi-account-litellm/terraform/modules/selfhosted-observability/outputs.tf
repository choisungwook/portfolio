output "grafana_url" {
  value = "http://${aws_lb.grafana.dns_name}"
}

output "endpoint_service_name" {
  description = "source 계정의 interface endpoint가 붙을 PrivateLink 서비스 이름"
  value       = aws_vpc_endpoint_service.remote_write.service_name
}
