
# nginx server
resource "aws_instance" "this" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.ec2_instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm_profile.name

  user_data = <<-EOF
              #!/bin/bash
              sleep 1; # wait for cloud-init to finish

              dnf update -y
              dnf install nginx -y
              systemctl enable nginx
              systemctl start nginx
              EOF

  tags = {
    Name        = "${var.ec2_name}-nginx"
    environment = "test"
  }
}
