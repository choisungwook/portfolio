output "production_url" {
  description = "Production listener. What users see"
  value       = "http://${aws_lb.web.dns_name}"
}

output "test_url" {
  description = "Test listener. Points at green while a deployment is in progress"
  value       = "http://${aws_lb.web.dns_name}:${var.test_listener_port}"
}

output "ecr_repository_url" {
  description = "Push target for make push"
  value       = aws_ecr_repository.web.repository_url
}

output "config_bucket" {
  description = "Upload target for make config"
  value       = aws_s3_bucket.config.bucket
}

output "config_object_key" {
  value = var.config_object_key
}

output "cluster_name" {
  value = aws_ecs_cluster.bluegreen.name
}

output "service_name" {
  value = aws_ecs_service.web.name
}

output "image_pipeline_name" {
  value = aws_codepipeline.image.name
}

output "config_pipeline_name" {
  value = aws_codepipeline.config.name
}

output "region" {
  value = var.aws_region
}
