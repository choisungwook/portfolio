resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.project_name}"
  retention_in_days = 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_codebuild_project" "this" {
  name          = var.project_name
  description   = "CodeBuild GitHub App connection example"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 20

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = var.codebuild_compute_type
    image                       = var.codebuild_image
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = false
  }

  source {
    type            = "GITHUB"
    location        = var.github_repository_url
    git_clone_depth = 1
    buildspec       = file("${path.module}/inline-buildspec.yml")

    git_submodules_config {
      fetch_submodules = false
    }

    auth {
      type     = "CODECONNECTIONS"
      resource = var.github_connection_arn
    }
  }

  source_version = var.github_branch

  logs_config {
    cloudwatch_logs {
      status     = "ENABLED"
      group_name = aws_cloudwatch_log_group.codebuild.name
    }
  }

  tags = {
    Environment = var.environment
  }
}
