resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux_2023_arm.id
  instance_type          = var.ec2_instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  associate_public_ip_address = true



  tags = {
    Name = "${var.project_name}-app"
  }
}
