resource "aws_ecs_cluster" "this" {
  name = var.project_name
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 1
}

# ---------- demo app: app/app.py를 그대로 돌린다 ----------
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "app"
    image     = local.app_image
    essential = true
    command   = ["sh", "-c", "pip install -q prometheus-client==0.26.0 && python -u -c \"$APP_CODE\""]

    environment = [
      { name = "APP_CODE", value = file("${path.module}/../app/app.py") },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "app"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "app"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.app_replicas
  launch_type     = "FARGATE"

  # default VPC public subnet이라 NAT 없이 공인 IP로 밖에 나간다.
  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.app.arn
  }
}

# ---------- 수집기: collector/config.yaml을 로컬과 똑같이 쓴다 ----------
resource "aws_ecs_task_definition" "collector" {
  family                   = "${var.project_name}-collector"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.collector.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "collector"
    image     = local.collector_image
    essential = true
    # 설정 파일 대신 환경 변수에서 설정을 읽는다.
    command = ["--config=env:COLLECTOR_CONFIG"]

    environment = [
      { name = "COLLECTOR_CONFIG", value = file("${path.module}/../collector/config.yaml") },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "AMP_REMOTE_WRITE_URL", value = "${aws_prometheus_workspace.this.prometheus_endpoint}api/v1/remote_write" },
      { name = "SCRAPE_DNS_NAME", value = local.app_dns_name },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "collector"
      }
    }
  }])
}

resource "aws_ecs_service" "collector" {
  name            = "collector"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.collector.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.collector.id]
    assign_public_ip = true
  }
}
