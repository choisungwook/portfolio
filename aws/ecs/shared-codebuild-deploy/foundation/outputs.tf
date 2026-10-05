output "lab" {
  description = "workload remote state가 읽는 비밀값 없는 foundation 계약"
  value = {
    aws_region             = var.aws_region
    project_name           = var.project_name
    account_id             = data.aws_caller_identity.lab.account_id
    cluster_name           = aws_ecs_cluster.hello_cluster.name
    cluster_arn            = aws_ecs_cluster.hello_cluster.arn
    service_names          = local.service_names
    public_subnet_ids      = module.lab_vpc.public_subnets
    security_group_id      = aws_security_group.hello_tasks.id
    repository_name        = aws_ecr_repository.hello_images.name
    repository_url         = aws_ecr_repository.hello_images.repository_url
    task_role_arn          = aws_iam_role.hello_task.arn
    execution_role_arn     = aws_iam_role.hello_execution.arn
    codebuild_role_arn     = aws_iam_role.deployment_build.arn
    codepipeline_role_arn  = aws_iam_role.service_pipeline.arn
    codebuild_project_name = local.codebuild_project_name
    codebuild_log_group    = aws_cloudwatch_log_group.deployment_builds.name
    service_log_groups     = { for name, log in aws_cloudwatch_log_group.hello_services : name => log.name }
    connection_arn         = local.connection_arn
    artifact_bucket        = aws_s3_bucket.pipeline_artifacts.bucket
  }
}

output "connection_arn" {
  description = "GitHub App 설치와 AVAILABLE 상태 확인 대상"
  value       = local.connection_arn
}

output "repository_url" {
  description = "bootstrap 이미지 push 대상"
  value       = aws_ecr_repository.hello_images.repository_url
}
