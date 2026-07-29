resource "aws_instance" "server" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    binary_url           = var.binary_url
    terraform_version    = var.terraform_version
    server_port          = var.server_port
    trigger_word         = var.trigger_word
    aws_region           = var.aws_region
    webhook_secret_param = aws_ssm_parameter.webhook_secret.name
    github_token_param   = aws_ssm_parameter.github_token.name
  })

  tags = {
    Name = var.project_name
  }
}

resource "aws_eip" "server" {
  instance = aws_instance.server.id

  tags = {
    Name = var.project_name
  }
}
