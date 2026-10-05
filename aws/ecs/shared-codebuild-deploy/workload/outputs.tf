output "task_definition_arns" {
  description = "최초 생성한 정의 ARN. 이후 운영 ARN은 ECS Service에서 조회"
  value       = { for name, definition in aws_ecs_task_definition.hello_service : name => definition.arn }
}

output "pipeline_names" {
  description = "서비스별 실행할 Pipeline"
  value       = { for name, pipeline in aws_codepipeline.service_deployment : name => pipeline.name }
}

output "shared_codebuild_project" {
  description = "두 Pipeline이 공유하는 유일한 CodeBuild project"
  value       = aws_codebuild_project.shared_deployer.name
}

output "github_task_diff_role_arn" {
  description = "PR diff 워크플로가 assume할 role"
  value       = aws_iam_role.github_task_diff.arn
}
