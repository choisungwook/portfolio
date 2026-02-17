resource "aws_instance" "nginx" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.ec2.id]

  user_data = <<-EOF
    #!/bin/bash
    dnf install -y nginx

    cat > /etc/nginx/conf.d/redirect.conf << 'NGINX'
    server {
        listen 80;
        server_name _;
        return 301 https://${var.redirect_target_host}$request_uri;
    }
    NGINX

    systemctl enable nginx
    systemctl start nginx
  EOF

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-nginx"
  }
}
