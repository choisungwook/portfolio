locals {
  # 127.0.0.1, not localhost: alpine may resolve localhost to ::1, and nginx listens on IPv4 only without IPv6 in the task.
  wget_health_check = {
    command  = ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/ || exit 1"]
    interval = 5
    timeout  = 2
    retries  = 1
  }

  # Every revision shares this; only image and healthCheck differ.
  web_container = {
    name      = "web"
    essential = true

    portMappings = [{
      containerPort = 80
      protocol      = "tcp"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.web.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "web"
      }
    }
  }

  task_definition_revisions = {
    # :1 healthy, the rollback target
    healthy = merge(local.web_container, {
      image       = "public.ecr.aws/nginx/nginx:stable-alpine"
      healthCheck = local.wget_health_check
    })

    # :2 stage 1 failure: the tag does not exist, so the task stops before RUNNING
    bad_image = merge(local.web_container, {
      image       = "public.ecr.aws/nginx/nginx:does-not-exist"
      healthCheck = local.wget_health_check
    })

    # :3 stage 2 failure: RUNNING, then the container health check fails on the first try
    unhealthy = merge(local.web_container, {
      image = "public.ecr.aws/nginx/nginx:stable-alpine"
      healthCheck = {
        command     = ["CMD-SHELL", "exit 1"]
        interval    = 5
        timeout     = 2
        retries     = 1
        startPeriod = 0
      }
    })
  }
}

resource "aws_ecs_cluster" "this" {
  name = var.project_name
}

# Three revisions of one family. depends_on fixes the registration order to :1, :2, :3.
resource "aws_ecs_task_definition" "healthy" {
  family                   = var.project_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn
  container_definitions    = jsonencode([local.task_definition_revisions.healthy])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
}

resource "aws_ecs_task_definition" "bad_image" {
  family                   = var.project_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn
  container_definitions    = jsonencode([local.task_definition_revisions.bad_image])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  depends_on = [aws_ecs_task_definition.healthy]
}

resource "aws_ecs_task_definition" "unhealthy" {
  family                   = var.project_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn
  container_definitions    = jsonencode([local.task_definition_revisions.unhealthy])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  depends_on = [aws_ecs_task_definition.bad_image]
}

resource "aws_ecs_service" "web" {
  name            = "${var.project_name}-svc"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.healthy.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # Blue/green manages capacity itself, so minimum/maximum percent are not set.
  deployment_controller {
    type = "ECS"
  }

  deployment_configuration {
    strategy             = "BLUE_GREEN"
    bake_time_in_minutes = "1"
  }

  # API default. The hands-on turns it on and off in the console.
  deployment_circuit_breaker {
    enable   = false
    rollback = false
  }

  # Count health check failures from the first check so stage 2 failures show up within seconds.
  health_check_grace_period_seconds = 0

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = true # default VPC subnets are public; without it image pull and logs fail
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web["blue"].arn
    container_name   = "web"
    container_port   = 80

    advanced_configuration {
      alternate_target_group_arn = aws_lb_target_group.web["green"].arn
      production_listener_rule   = aws_lb_listener_rule.production.arn
      role_arn                   = aws_iam_role.ecs_infrastructure.arn
    }
  }

  # Detach the role only after the service is gone; ECS needs it to clean up listener rules.
  depends_on = [aws_iam_role_policy_attachment.ecs_infrastructure]

  # The console owns these during the hands-on. Without this, the next apply reverts the revision and breaker settings.
  lifecycle {
    ignore_changes = [task_definition, deployment_circuit_breaker]
  }
}
