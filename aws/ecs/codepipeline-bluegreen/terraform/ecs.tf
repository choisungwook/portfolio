resource "aws_ecs_cluster" "bluegreen" {
  name = var.project_name
}

# 초기 revision만 terraform이 만든다. 이후 revision은 파이프라인이 CLI로 등록한다.
resource "aws_ecs_task_definition" "web" {
  family                   = local.task_family
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = var.container_name
    image     = var.bootstrap_image
    essential = true

    portMappings = [{
      containerPort = 80
      protocol      = "tcp"
    }]

    environment = [
      { name = "APP_MESSAGE", value = "bootstrap" },
      { name = "APP_HEALTH_STATUS", value = "200" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = var.container_name
      }
    }
  }])
}

resource "aws_ecs_service" "web" {
  name            = local.service_name
  cluster         = aws_ecs_cluster.bluegreen.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 30

  deployment_controller {
    type = "ECS"
  }

  deployment_configuration {
    strategy             = "BLUE_GREEN"
    bake_time_in_minutes = var.bake_time_in_minutes

    lifecycle_hook {
      hook_target_arn  = aws_lambda_function.hook.arn
      role_arn         = aws_iam_role.ecs_hook.arn
      lifecycle_stages = var.hook_lifecycle_stages
    }
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.blue.arn
    container_name   = var.container_name
    container_port   = 80

    advanced_configuration {
      alternate_target_group_arn = aws_lb_target_group.green.arn
      production_listener_rule   = aws_lb_listener_rule.production.arn
      test_listener_rule         = aws_lb_listener_rule.test.arn
      role_arn                   = aws_iam_role.ecs_infrastructure.arn
    }
  }

  # task_definition은 파이프라인이, load_balancer의 blue/green 짝은 ECS가 배포마다 바꾼다.
  lifecycle {
    ignore_changes = [task_definition, load_balancer]
  }

  depends_on = [
    aws_lb_listener_rule.production,
    aws_lb_listener_rule.test,
    aws_iam_role_policy.ecs_infrastructure,
    aws_iam_role_policy.ecs_hook,
  ]
}
