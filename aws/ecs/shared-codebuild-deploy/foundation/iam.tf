resource "aws_iam_role" "hello_task" {
  name = "${var.project_name}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role" "hello_execution" {
  name               = "${var.project_name}-execution"
  assume_role_policy = aws_iam_role.hello_task.assume_role_policy
}

resource "aws_iam_role_policy" "hello_execution" {
  name = "pull-image-and-write-logs"
  role = aws_iam_role.hello_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = aws_ecr_repository.hello_images.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [for log in aws_cloudwatch_log_group.hello_services : "${log.arn}:*"]
      }
    ]
  })
}

resource "aws_iam_role" "deployment_build" {
  name = "${var.project_name}-codebuild"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "deployment_build" {
  name = "deploy-lab-services"
  role = aws_iam_role.deployment_build.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:DescribeServices", "ecs:UpdateService"]
        Resource = local.service_arns
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:RegisterTaskDefinition"]
        Resource = local.task_definition_arns
      },
      {
        Effect    = "Allow"
        Action    = ["ecs:TagResource"]
        Resource  = local.task_definition_arns
        Condition = { StringEquals = { "ecs:CreateAction" = "RegisterTaskDefinition" } }
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:DescribeRepositories", "ecr:DescribeImages"]
        Resource = aws_ecr_repository.hello_images.arn
      },
      {
        Effect   = "Allow"
        Action   = ["codeconnections:UseConnection", "codestar-connections:UseConnection"]
        Resource = local.connection_arn
      },
      {
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = [aws_iam_role.hello_task.arn, aws_iam_role.hello_execution.arn]
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource = "${aws_s3_bucket.pipeline_artifacts.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation", "s3:GetBucketAcl"]
        Resource = aws_s3_bucket.pipeline_artifacts.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.deployment_builds.arn}:*"
      }
    ]
  })
}

resource "aws_iam_role" "service_pipeline" {
  name = "${var.project_name}-codepipeline"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codepipeline.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "service_pipeline" {
  name = "source-and-shared-build"
  role = aws_iam_role.service_pipeline.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["codebuild:StartBuild", "codebuild:BatchGetBuilds"]
        Resource = "${local.arn_prefix}:codebuild:${var.aws_region}:${data.aws_caller_identity.lab.account_id}:project/${local.codebuild_project_name}"
      },
      {
        Effect   = "Allow"
        Action   = [startswith(local.connection_arn, "arn:aws:codestar-connections:") ? "codestar-connections:UseConnection" : "codeconnections:UseConnection"]
        Resource = local.connection_arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"]
        Resource = "${aws_s3_bucket.pipeline_artifacts.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetBucketVersioning", "s3:GetBucketLocation", "s3:GetBucketAcl"]
        Resource = aws_s3_bucket.pipeline_artifacts.arn
      }
    ]
  })
}
