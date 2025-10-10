# Launch Template for Canary
resource "aws_launch_template" "canary" {
  name_prefix     = "${var.project_name}-canary-"
  image_id        = data.aws_ami.amazon_linux_2023_arm64.id
  instance_type   = var.instance_type
  default_version = 1

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2.name
  }

  vpc_security_group_ids = [aws_security_group.ec2.id]

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.ebs_volume_size
      volume_type           = var.ebs_volume_type
      encrypted             = true
      delete_on_termination = true
    }
  }

  user_data = base64encode(file("${path.module}/user_data.sh"))

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name        = "${var.project_name}-canary"
      Project     = var.project_tag
      Environment = var.environment
      Strategy    = "canary"
    }
  }

  tags = {
    Name        = "${var.project_name}-canary-lt"
    Project     = var.project_tag
    Environment = var.environment
  }
}

# Auto Scaling Group - Canary
resource "aws_autoscaling_group" "canary" {
  name                      = "${var.project_name}-canary-asg"
  vpc_zone_identifier       = data.aws_subnets.public.ids
  desired_capacity          = 4
  max_size                  = 6
  min_size                  = 4
  health_check_type         = "ELB"
  health_check_grace_period = 60
  target_group_arns         = [aws_lb_target_group.main.arn]

  launch_template {
    id      = aws_launch_template.canary.id
    version = aws_launch_template.canary.latest_version
  }

  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupMaxSize",
    "GroupMinSize",
    "GroupPendingInstances",
    "GroupStandbyInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances"
  ]

  # instance_refresh {
  #   strategy = "Rolling"
  #   preferences {
  #     min_healthy_percentage = 90
  #     max_healthy_percentage = 200
  #     instance_warmup        = 60
  #     checkpoint_percentages = [25, 50, 75]
  #     checkpoint_delay       = 3600
  #   }
  # }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-canary"
    propagate_at_launch = true
  }

  tag {
    key                 = "Project"
    value               = var.project_tag
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  tag {
    key                 = "Strategy"
    value               = "canary"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}

# # Lifecycle Hook for EC2_INSTANCE_TERMINATING
# resource "aws_autoscaling_lifecycle_hook" "terminating" {
#   name                   = "${var.project_name}-terminating-hook"
#   autoscaling_group_name = aws_autoscaling_group.canary.name
#   lifecycle_transition   = "autoscaling:EC2_INSTANCE_TERMINATING"
#   heartbeat_timeout      = 30
#   default_result         = "CONTINUE"

#   # Optional: notification metadata
#   notification_metadata = jsonencode({
#     description = "Lifecycle hook for graceful termination"
#   })
# }
