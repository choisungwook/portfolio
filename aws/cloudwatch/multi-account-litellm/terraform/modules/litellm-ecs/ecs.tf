resource "aws_ecs_cluster" "litellm" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = var.container_insights
  }
}

locals {
  runtime_platform = {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  network = {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }
}

# ---------- LiteLLM ----------
resource "aws_ecs_task_definition" "litellm" {
  family                   = "${local.name}-litellm"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = local.runtime_platform.operating_system_family
    cpu_architecture        = local.runtime_platform.cpu_architecture
  }

  container_definitions = jsonencode([{
    name      = "litellm"
    image     = var.litellm_image
    essential = true

    # config.yaml을 이미지에 굽지 않고 환경 변수로 넘겨 기동 직전에 파일로 쓴다.
    entryPoint = ["sh", "-c"]
    command    = ["printf '%s' \"$LITELLM_CONFIG\" > /tmp/config.yaml && exec litellm --config /tmp/config.yaml --port 4000"]

    portMappings = [{ containerPort = 4000, protocol = "tcp" }]

    environment = [
      { name = "LITELLM_CONFIG", value = var.litellm_config },
      { name = "JSON_LOGS", value = "True" },
      { name = "LITELLM_LOCAL_MODEL_COST_MAP", value = "True" },
    ]

    secrets = [
      { name = "LITELLM_MASTER_KEY", valueFrom = aws_ssm_parameter.master_key.arn },
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
    ]

    # 이미지에 curl이 없어 python으로 확인한다.
    healthCheck = {
      command     = ["CMD-SHELL", "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:4000/health/liveliness', timeout=5).status==200 else 1)\""]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 120
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "litellm"
      }
    }
  }])
}

resource "aws_ecs_service" "litellm" {
  name                              = "litellm"
  cluster                           = aws_ecs_cluster.litellm.id
  task_definition                   = aws_ecs_task_definition.litellm.arn
  desired_count                     = var.replicas
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 180

  network_configuration {
    subnets          = local.network.subnets
    security_groups  = local.network.security_groups
    assign_public_ip = local.network.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.litellm.arn
    container_name   = "litellm"
    container_port   = 4000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.litellm.arn
  }

  depends_on = [aws_lb_listener.http, aws_ecs_service.db]
}

# ---------- Postgres: virtual key와 team을 담는다. 실습용이라 task가 바뀌면 데이터가 사라진다 ----------
resource "aws_ecs_task_definition" "db" {
  family                   = "${local.name}-db"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = local.runtime_platform.operating_system_family
    cpu_architecture        = local.runtime_platform.cpu_architecture
  }

  container_definitions = jsonencode([{
    name         = "postgres"
    image        = var.postgres_image
    essential    = true
    portMappings = [{ containerPort = 5432, protocol = "tcp" }]

    environment = [
      { name = "POSTGRES_USER", value = "litellm" },
      { name = "POSTGRES_DB", value = "litellm" },
    ]

    secrets = [
      { name = "POSTGRES_PASSWORD", valueFrom = aws_ssm_parameter.db_password.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.support.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "db"
      }
    }
  }])
}

resource "aws_ecs_service" "db" {
  name            = "db"
  cluster         = aws_ecs_cluster.litellm.id
  task_definition = aws_ecs_task_definition.db.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.network.subnets
    security_groups  = local.network.security_groups
    assign_public_ip = local.network.assign_public_ip
  }

  service_registries {
    registry_arn = aws_service_discovery_service.db.arn
  }
}

# ---------- 수집기: 계정마다 1개 ----------
resource "aws_ecs_task_definition" "collector" {
  family                   = "${local.name}-collector"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.collector.arn

  runtime_platform {
    operating_system_family = local.runtime_platform.operating_system_family
    cpu_architecture        = local.runtime_platform.cpu_architecture
  }

  container_definitions = jsonencode([{
    name      = "collector"
    image     = var.collector_image
    essential = true

    # ADOT collector는 AOT_CONFIG_CONTENT 환경 변수를 설정 파일로 읽는다.
    environment = [
      { name = "AOT_CONFIG_CONTENT", value = local.collector_config },
    ]

    secrets = [
      { name = "LITELLM_MASTER_KEY", valueFrom = aws_ssm_parameter.master_key.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.support.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "collector"
      }
    }
  }])
}

resource "aws_ecs_service" "collector" {
  name            = "collector"
  cluster         = aws_ecs_cluster.litellm.id
  task_definition = aws_ecs_task_definition.collector.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.network.subnets
    security_groups  = local.network.security_groups
    assign_public_ip = local.network.assign_public_ip
  }
}

# ---------- 부하 생성기: local/loadgen/loadgen.py를 그대로 돌린다 ----------
resource "aws_ecs_task_definition" "loadgen" {
  family                   = "${local.name}-loadgen"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = local.runtime_platform.operating_system_family
    cpu_architecture        = local.runtime_platform.cpu_architecture
  }

  container_definitions = jsonencode([{
    name      = "loadgen"
    image     = var.loadgen_image
    essential = true
    command   = ["python", "-u", "-c", var.loadgen_script]

    environment = [
      { name = "TARGETS", value = "${var.env}=${local.litellm_dns}:4000" },
      { name = "INTERVAL_SECONDS", value = "1" },
    ]

    secrets = [
      { name = "LITELLM_MASTER_KEY", valueFrom = aws_ssm_parameter.master_key.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.support.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "loadgen"
      }
    }
  }])
}

resource "aws_ecs_service" "loadgen" {
  name            = "loadgen"
  cluster         = aws_ecs_cluster.litellm.id
  task_definition = aws_ecs_task_definition.loadgen.arn
  desired_count   = var.loadgen_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.network.subnets
    security_groups  = local.network.security_groups
    assign_public_ip = local.network.assign_public_ip
  }

  depends_on = [aws_ecs_service.litellm]
}
