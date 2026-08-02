# ECS-optimized AL2023 AMI. The SSM parameter path has an arch segment only for arm64.
data "aws_ssm_parameter" "ecs_ami" {
  name = var.arch == "arm64" ? "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id" : "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

resource "aws_instance" "container_instance" {
  ami                    = data.aws_ssm_parameter.ecs_ami.insecure_value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.container_instance.name

  # The ECS agent joins the cluster based on this config file.
  user_data = <<-EOF
    #!/bin/bash
    echo ECS_CLUSTER=${aws_ecs_cluster.this.name} >> /etc/ecs/ecs.config
  EOF

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-container-instance"
  }
}
