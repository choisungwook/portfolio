resource "aws_codebuild_project" "shared_deployer" {
  name          = local.lab.codebuild_project_name
  description   = "Deploy Git task JSON with an ECR image tag"
  service_role  = local.lab.codebuild_role_arn
  build_timeout = 40

  source {
    type      = "CODEPIPELINE"
    buildspec = var.source_directory == "." ? "buildspec.yml" : "${var.source_directory}/buildspec.yml"
  }

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:8.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false

    environment_variable {
      name  = "SOURCE_DIRECTORY"
      value = var.source_directory
    }
    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = local.lab.aws_region
    }
    dynamic "environment_variable" {
      for_each = {
        CLUSTER_NAME   = local.lab.cluster_name
        ECR_REPOSITORY = local.lab.repository_name
      }
      content {
        name  = environment_variable.key
        value = environment_variable.value
      }
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = local.lab.codebuild_log_group
      stream_name = "deploy"
    }
  }
}
