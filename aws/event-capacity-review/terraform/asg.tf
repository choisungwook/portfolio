resource "aws_launch_template" "app" {
  name_prefix   = "${var.project_name}-"
  image_id      = data.aws_ami.al2023.id
  instance_type = var.instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2_ssm.name
  }

  vpc_security_group_ids = [aws_security_group.app.id]

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tftpl", {}))

  metadata_options {
    http_tokens = "required"
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size = var.ebs_size
      volume_type = "gp3"
      encrypted   = true
    }
  }

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "${var.project_name}-app"
    }
  }
}

resource "aws_autoscaling_group" "app" {
  name                      = var.project_name
  min_size                  = var.asg_min_size
  max_size                  = var.asg_max_size
  desired_capacity          = var.asg_desired_capacity
  vpc_zone_identifier       = data.aws_subnets.default.ids
  target_group_arns         = [aws_lb_target_group.app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 60

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # Stopped instances finish user_data once, then wait without compute cost.
  # Scale out pulls from this pool and skips provisioning plus first boot.
  warm_pool {
    pool_state = "Stopped"
    min_size   = var.warm_pool_min_size

    instance_reuse_policy {
      reuse_on_scale_in = true
    }
  }

  # desired_capacity moves with load and scheduled actions after apply
  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

resource "aws_autoscaling_policy" "cpu_target_tracking" {
  name                   = "${var.project_name}-cpu-target"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }

    target_value = var.cpu_target_value
  }
}

# Events start at a known time - raise capacity ahead of it instead of
# waiting for alarms. Reactive scaling stays on as the safety net.
resource "aws_autoscaling_schedule" "event_scale_out" {
  count = var.event_scale_out_at == null ? 0 : 1

  scheduled_action_name  = "${var.project_name}-event-scale-out"
  autoscaling_group_name = aws_autoscaling_group.app.name
  start_time             = var.event_scale_out_at
  min_size               = var.event_min_size
  max_size               = var.asg_max_size
  desired_capacity       = var.event_min_size
}

resource "aws_autoscaling_schedule" "event_scale_in" {
  count = var.event_scale_in_at == null ? 0 : 1

  scheduled_action_name  = "${var.project_name}-event-scale-in"
  autoscaling_group_name = aws_autoscaling_group.app.name
  start_time             = var.event_scale_in_at
  min_size               = var.asg_min_size
  max_size               = var.asg_max_size
  desired_capacity       = var.asg_min_size
}
