# 파이프라인 1: ECR push -> task definition의 image 교체 -> blue/green 배포
resource "aws_codepipeline" "image" {
  name           = "${var.project_name}-image"
  role_arn       = aws_iam_role.codepipeline.arn
  pipeline_type  = "V2"
  execution_mode = "QUEUED"

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "ECR"
      category         = "Source"
      owner            = "AWS"
      provider         = "ECR"
      version          = "1"
      output_artifacts = ["image"]

      configuration = {
        RepositoryName = aws_ecr_repository.web.name
        ImageTag       = "latest"
      }
    }
  }

  stage {
    name = "Deploy"

    action {
      name            = "UpdateService"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["image"]

      configuration = {
        ProjectName = aws_codebuild_project.deploy.name
        EnvironmentVariables = jsonencode([
          { name = "DEPLOY_MODE", value = "image", type = "PLAINTEXT" },
        ])
      }
    }
  }
}

# 파이프라인 2: S3에 env.json 업로드 -> task definition의 environment 교체 -> blue/green 배포. image는 그대로.
resource "aws_codepipeline" "config" {
  name           = "${var.project_name}-config"
  role_arn       = aws_iam_role.codepipeline.arn
  pipeline_type  = "V2"
  execution_mode = "QUEUED"

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "S3"
      category         = "Source"
      owner            = "AWS"
      provider         = "S3"
      version          = "1"
      output_artifacts = ["config"]

      configuration = {
        S3Bucket             = aws_s3_bucket.config.bucket
        S3ObjectKey          = var.config_object_key
        PollForSourceChanges = "false"
      }
    }
  }

  stage {
    name = "Deploy"

    action {
      name            = "UpdateService"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["config"]

      configuration = {
        ProjectName = aws_codebuild_project.deploy.name
        EnvironmentVariables = jsonencode([
          { name = "DEPLOY_MODE", value = "config", type = "PLAINTEXT" },
        ])
      }
    }
  }
}
