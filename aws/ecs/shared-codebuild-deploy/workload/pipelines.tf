resource "aws_codepipeline" "service_deployment" {
  for_each = toset(local.lab.service_names)

  name           = "${local.lab.project_name}-${each.key}"
  role_arn       = local.lab.codepipeline_role_arn
  pipeline_type  = "V2"
  execution_mode = "QUEUED"

  artifact_store {
    location = local.lab.artifact_bucket
    type     = "S3"
  }

  variable {
    name        = "IMAGE_TAG"
    description = "ECR image tag to deploy (required)"
  }

  stage {
    name = "Source"

    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["SourceArtifact"]

      configuration = {
        ConnectionArn        = local.lab.connection_arn
        FullRepositoryId     = var.github_repository
        BranchName           = var.github_branch
        OutputArtifactFormat = "CODEBUILD_CLONE_REF"
        DetectChanges        = "false"
      }
    }
  }

  stage {
    name = "Deploy"

    action {
      name             = "SharedCodeBuild"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = []

      configuration = {
        ProjectName = aws_codebuild_project.shared_deployer.name
        EnvironmentVariables = jsonencode([for name, value in {
          SERVICE_NAME = each.key
          TASK_FILE    = "${var.source_directory}/deploy/task-definitions/${each.key}.json"
          IMAGE_TAG    = "#{variables.IMAGE_TAG}"
        } : { name = name, value = value, type = "PLAINTEXT" }])
      }
    }
  }

  depends_on = [aws_ecs_service.hello_service]
}
