resource "aws_instance" "backend" {
  ami                    = local.ami_id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.ec2.id]
  subnet_id              = data.aws_subnets.default.ids[0]
  user_data              = file("${path.module}/templates/user_data.sh")

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-backend"
  }
}
