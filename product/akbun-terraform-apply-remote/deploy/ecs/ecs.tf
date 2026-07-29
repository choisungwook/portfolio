resource "aws_cloudwatch_log_group" "server" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 30
}

resource "aws_ecs_cluster" "server" {
  name = var.project_name
}

resource "aws_ecs_task_definition" "server" {
  family                   = var.project_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  # Graviton 규칙에 맞춰 Fargate도 ARM64로 실행한다. 이미지도 arm64로 빌드한다.
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  volume {
    name = "data"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.data.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.data.id
        iam             = "DISABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "server"
      image     = var.image
      essential = true

      portMappings = [
        {
          containerPort = var.server_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "ATR_PORT", value = tostring(var.server_port) },
        { name = "ATR_TRIGGER", value = var.trigger_word },
        { name = "ATR_DATA_DIR", value = "/data" },
      ]

      secrets = [
        { name = "ATR_WEBHOOK_SECRET", valueFrom = aws_ssm_parameter.webhook_secret.arn },
        { name = "ATR_GITHUB_TOKEN", valueFrom = aws_ssm_parameter.github_token.arn },
      ]

      mountPoints = [
        {
          sourceVolume  = "data"
          containerPath = "/data"
        }
      ]

      # Fargate가 허용하는 최대 drain 시간. SIGTERM 후 120초 안에 끝나지
      # 않는 apply는 잘릴 수 있다. 더 긴 drain이 필요하면 EC2 배포를 쓴다.
      stopTimeout = 120

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.server.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "server"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "server" {
  name            = var.project_name
  cluster         = aws_ecs_cluster.server.id
  task_definition = aws_ecs_task_definition.server.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # 새 task가 healthy가 된 뒤에만 이전 task를 내려 무중단으로 교체한다.
  # 겹치는 몇 초 동안 두 task가 같은 EFS state를 볼 수 있으나, 이전 task는
  # ALB에서 빠져 새 webhook을 받지 않으므로 실제 경합은 발생하지 않는다.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.server.arn
    container_name   = "server"
    container_port   = var.server_port
  }

  depends_on = [aws_lb_listener.https]
}
