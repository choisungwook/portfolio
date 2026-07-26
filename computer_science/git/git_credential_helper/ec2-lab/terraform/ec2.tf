resource "aws_instance" "lab" {
  ami                  = data.aws_ami.al2023.id
  instance_type        = var.instance_type
  subnet_id            = data.aws_subnets.default.ids[0]
  iam_instance_profile = aws_iam_instance_profile.ec2_ssm.name

  # git과, SSM에서 토큰을 꺼내오는 custom credential helper를 심어 둔다.
  # helper 이름을 git-credential-<name> 규칙에 맞추면 credential.helper=ssm 으로 부를 수 있다.
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    token_parameter_name = var.token_parameter_name
    aws_region           = var.aws_region
  })

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name        = "${var.project_name}-lab"
    Environment = var.environment
  }
}
