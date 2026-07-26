resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.project_name}"
  retention_in_days = 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_codebuild_project" "this" {
  name          = var.project_name
  description   = "Clone repo b inside the build using CodeConnections git credentials"
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

    # repo a의 shell script가 이 값으로 repo b를 clone한다.
    # URL에 토큰을 넣지 않는다. 인증은 pre_build가 심어 둔 credential store가 채운다.
    environment_variable {
      name  = "REPO_B_URL"
      value = local.repo_b_url
    }

    # pre_build가 이 path로 credential helper에게 토큰을 요청한다.
    environment_variable {
      name  = "REPO_A_PATH"
      value = local.repo_a_path
    }
  }

  # buildspec을 지정하지 않으므로 repo a 루트의 buildspec.yml을 읽는다.
  source {
    type            = "GITHUB"
    location        = local.repo_a_url
    git_clone_depth = 1

    git_submodules_config {
      fetch_submodules = false
    }

    auth {
      type     = "CODECONNECTIONS"
      resource = aws_codeconnections_connection.github.arn
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
