# Launch Template for Rolling Update
resource "aws_launch_template" "rolling_update" {
  name_prefix     = "${var.project_name}-rolling-"
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

  user_data = base64encode(<<-EOF
    #!/bin/bash

    sleep 1;

    dnf update -y
    dnf install -y nginx
    systemctl start nginx
    systemctl enable nginx

    # Create a simple index page
    echo "[Info] Creating index.html"

    cat > /usr/share/nginx/html/index.html <<'HTML'
    <!DOCTYPE html>
    <html>
    <head>
      <title>Rolling Update Strategy v1</title>
    </head>
    <body>
      <h1>Rolling Update Strategy v1</h1>
    </body>
    </html>
    HTML

    echo "[Info] Done creating index.html"

    systemctl restart nginx
  EOF
  )

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name        = "${var.project_name}-rollingupdate"
      Project     = var.project_tag
      Environment = var.environment
      Strategy    = "rolling-update"
    }
  }

  tags = {
    Name        = "${var.project_name}-rolling-lt"
    Project     = var.project_tag
    Environment = var.environment
  }
}

# Auto Scaling Group - Rolling Update
resource "aws_autoscaling_group" "rolling_update" {
  name                = "${var.project_name}-rolling-asg"
  vpc_zone_identifier = data.aws_subnets.public.ids
  desired_capacity    = 4
  max_size            = 6
  min_size            = 4
  # health_check_type   = "ELB"
  health_check_grace_period = 180

  launch_template {
    id = aws_launch_template.rolling_update.id
    # version = aws_launch_template.rolling_update.latest_version
    version = 2
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

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      max_healthy_percentage = 100
      instance_warmup        = 30
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-rollingupdate"
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
    value               = "rolling-update"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}
