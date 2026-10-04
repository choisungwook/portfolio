# 파이프라인 두 개가 이 프로젝트 하나를 공유한다. DEPLOY_MODE는 파이프라인 action이 넣는다.
resource "aws_codebuild_project" "deploy" {
  name          = "${var.project_name}-deploy"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 30

  artifacts {
    type = "CODEPIPELINE"
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = file("${path.module}/../pipeline/buildspec.yml")
  }

  environment {
    compute_type = var.codebuild_compute_type
    type         = "ARM_CONTAINER"
    image        = var.codebuild_image

    environment_variable {
      name  = "CLUSTER"
      value = aws_ecs_cluster.bluegreen.name
    }

    environment_variable {
      name  = "SERVICE"
      value = aws_ecs_service.web.name
    }

    environment_variable {
      name  = "TASK_FAMILY"
      value = local.task_family
    }

    environment_variable {
      name  = "CONTAINER_NAME"
      value = var.container_name
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
    }
  }
}
