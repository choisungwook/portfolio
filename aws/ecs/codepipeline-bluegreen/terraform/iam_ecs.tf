resource "aws_iam_role" "task_execution" {
  name = "${var.project_name}-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS가 배포 중 listener rule의 forward 대상을 바꾸고 target을 등록할 때 쓰는 역할
resource "aws_iam_role" "ecs_infrastructure" {
  name = "${var.project_name}-ecs-infrastructure"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_infrastructure" {
  name = "load-balancer"
  role = aws_iam_role.ecs_infrastructure.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeListeners",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets",
        ]
        Resource = [
          aws_lb_target_group.blue.arn,
          aws_lb_target_group.green.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = ["elasticloadbalancing:ModifyListener"]
        Resource = [
          aws_lb_listener.production.arn,
          aws_lb_listener.test.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = ["elasticloadbalancing:ModifyRule"]
        Resource = [
          aws_lb_listener_rule.production.arn,
          aws_lb_listener_rule.test.arn,
        ]
      },
    ]
  })
}

# ECS가 lifecycle hook Lambda를 호출할 때 쓰는 역할
resource "aws_iam_role" "ecs_hook" {
  name = "${var.project_name}-ecs-hook"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_hook" {
  name = "invoke-hook"
  role = aws_iam_role.ecs_hook.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.hook.arn
    }]
  })
}
