# 최초 생성 전용. 이후 설정은 export-taskdef.sh로 추출한 Git JSON에서 관리
resource "aws_ecs_task_definition" "hello_service" {
  for_each = toset(local.lab.service_names)

  family                   = "${local.lab.project_name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  task_role_arn            = local.lab.task_role_arn
  execution_role_arn       = local.lab.execution_role_arn

  container_definitions = jsonencode([{
    name         = "hello"
    image        = "${local.lab.repository_url}@${data.aws_ecr_image.bootstrap.image_digest}"
    essential    = true
    portMappings = [{ containerPort = 8080, hostPort = 8080, protocol = "tcp" }]
    environment = [
      { name = "SERVICE_NAME", value = each.key },
      { name = "MESSAGE", value = "Hello from ${trimprefix(each.key, "hello-")}" },
      { name = "APP_ENV", value = "dev" },
      { name = "LOG_LEVEL", value = "info" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = local.lab.service_log_groups[each.key]
        awslogs-region        = local.lab.aws_region
        awslogs-stream-prefix = "app"
      }
    }
    healthCheck = {
      command     = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2).read()"]
      interval    = 10
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
  }])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  lifecycle {
    ignore_changes = all
  }
}

resource "aws_ecs_service" "hello_service" {
  for_each = toset(local.lab.service_names)

  name                  = each.key
  cluster               = local.lab.cluster_arn
  task_definition       = aws_ecs_task_definition.hello_service[each.key].arn
  desired_count         = var.desired_count
  launch_type           = "FARGATE"
  platform_version      = "1.4.0"
  wait_for_steady_state = true

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_controller {
    type = "ECS"
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.lab.public_subnet_ids
    security_groups  = [local.lab.security_group_id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}
