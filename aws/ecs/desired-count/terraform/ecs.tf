locals {
  service_name = "${var.project_name}-web"

  # Write default.conf at start, then hand PID 1 to nginx.
  # Quoted heredoc ('EOF') keeps $hostname away from shell expansion.
  # file() output is not re-parsed as a template, so default.conf needs no $${ escaping.
  container_command = <<-EOT
    cat > /etc/nginx/conf.d/default.conf <<'EOF'
    ${file("${path.module}/../nginx/default.conf")}EOF
    exec nginx -g 'daemon off;'
  EOT
}

resource "aws_ecs_cluster" "this" {
  name = var.project_name
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project_name}-web"
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
    name       = "web"
    image      = "public.ecr.aws/nginx/nginx:stable-alpine"
    essential  = true
    entryPoint = ["sh", "-c"]
    command    = [local.container_command]

    portMappings = [{
      containerPort = 80
      protocol      = "tcp"
    }]

    # 127.0.0.1, not localhost: alpine may resolve localhost to ::1, and nginx listens on IPv4 only.
    healthCheck = {
      command     = ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/health || exit 1"]
      interval    = 10
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.web.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "web"
      }
    }
  }])
}

# No lifecycle ignore_changes on desired_count: the hands-on observes console drift in terraform plan.
resource "aws_ecs_service" "web" {
  name            = local.service_name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = true # default VPC subnets are public; without it image pull and logs fail
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 80
  }

  # The target group must be attached to a listener before the service registers targets.
  depends_on = [aws_lb_listener.http]
}

# Off by default: on the first apply the service does not exist yet, so the read would fail.
# Referenced by name instead of aws_ecs_service.web so a pending desired_count change does not defer the read to apply time.
data "aws_ecs_service" "web" {
  count = var.observe_counts ? 1 : 0

  cluster_arn  = aws_ecs_cluster.this.arn
  service_name = local.service_name
}
