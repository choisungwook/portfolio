# Get latest Amazon Linux 2023 ARM64 AMI
data "aws_ami" "amazon_linux_2023_arm64" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# EC2 Security Group
resource "aws_security_group" "ec2" {
  name        = "${var.common_tags["Name"]}-ec2-sg"
  description = "Security group for EC2 instances"
  vpc_id      = data.aws_vpc.default.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.common_tags["Name"]}-ec2-sg"
    }
  )
}

resource "aws_security_group_rule" "ec2_ingress_from_alb" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = aws_security_group.ec2.id
}

# resource "aws_security_group_rule" "ec2_ingress_from_any" {
#   type              = "ingress"
#   from_port         = 80
#   to_port           = 80
#   protocol          = "tcp"
#   cidr_blocks       = ["0.0.0.0/0"]
#   security_group_id = aws_security_group.ec2.id
# }

resource "aws_security_group_rule" "ec2_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

# IAM Role for EC2
resource "aws_iam_role" "ec2" {
  name = "${var.common_tags["Name"]}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.common_tags["Name"]}-ec2-profile"
  role = aws_iam_role.ec2.name

  tags = var.common_tags
}

# Launch Template
resource "aws_launch_template" "v1" {
  name_prefix   = "${var.common_tags["Name"]}-lt-"
  image_id      = data.aws_ami.amazon_linux_2023_arm64.id
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.ec2.arn
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.ebs_volume_size
      volume_type           = var.ebs_volume_type
      encrypted             = true
      delete_on_termination = true
    }
  }

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.ec2.id]
  }

  user_data = base64encode(file("${path.module}/user_data.sh"))

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      var.common_tags,
      {
        Name = "${var.common_tags["Name"]}-v1-instance"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      var.common_tags,
      {
        Name = "${var.common_tags["Name"]}-volume"
      }
    )
  }

  tags = merge(
    var.common_tags,
    {
      Name = "${var.common_tags["Name"]}-lt"
    }
  )
}

# Auto Scaling Group (not attached to ALB for manual integration)
resource "aws_autoscaling_group" "v1" {
  name                = "${var.common_tags["Name"]}-asg-v1"
  vpc_zone_identifier = data.aws_subnets.public.ids
  desired_capacity    = 1
  max_size            = 2
  min_size            = 1

  launch_template {
    id      = aws_launch_template.v1.id
    version = "$Latest"
  }

  # target_group_arns         = [aws_lb_target_group.main.arn]
  health_check_type         = "EC2"
  health_check_grace_period = 60

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
  metrics_granularity = "1Minute"


  tag {
    key                 = "Name"
    value               = "${var.common_tags["Name"]}-asg-v1"
    propagate_at_launch = true
  }

  tag {
    key                 = "Project"
    value               = var.common_tags["Project"]
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.common_tags["Environment"]
    propagate_at_launch = true
  }
}

# Outputs
output "ec2_security_group_id" {
  description = "Security group ID of EC2 instances"
  value       = aws_security_group.ec2.id
}

output "iam_role_arn" {
  description = "ARN of the IAM role for EC2"
  value       = aws_iam_role.ec2.arn
}

output "iam_instance_profile_arn" {
  description = "ARN of the IAM instance profile"
  value       = aws_iam_instance_profile.ec2.arn
}
