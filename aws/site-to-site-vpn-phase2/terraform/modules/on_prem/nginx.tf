resource "aws_iam_role" "nginx_role" {
  name = "${var.project_name}-onprem-nginx-role"

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

  tags = {
    Name    = "${var.project_name}-onprem-nginx-role"
    Project = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "nginx_ssm_policy" {
  role       = aws_iam_role.nginx_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nginx_instance_profile" {
  name = "${var.project_name}-onprem-nginx-profile"
  role = aws_iam_role.nginx_role.name

  tags = {
    Name    = "${var.project_name}-onprem-nginx-profile"
    Project = var.project_name
  }
}

resource "aws_security_group" "nginx_sg" {
  name        = "${var.project_name}-onprem-nginx-sg"
  description = "Security group for the nginx server in onprem VPC"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "ICMP from cloud"
    protocol    = "icmp"
    from_port   = -1
    to_port     = -1
    cidr_blocks = [var.cloud_vpc_cidr]
  }

  ingress {
    description = "HTTP from cloud"
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = [var.cloud_vpc_cidr]
  }

  ingress {
    description = "HTTPS from cloud"
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = [var.cloud_vpc_cidr]
  }

  egress {
    description = "Allow all outbound traffic"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-onprem-nginx-sg"
    Project = var.project_name
  }
}

resource "aws_instance" "nginx" {
  ami                    = var.onprem_nginx.ami_id
  instance_type          = var.onprem_nginx.instance_type
  subnet_id              = module.vpc.private_subnets[0]
  vpc_security_group_ids = [aws_security_group.nginx_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.nginx_instance_profile.name

  user_data = <<-EOF
    #!/bin/bash
    dnf update -y
    dnf install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "<h1>Hello from Onprem Nginx Server: $(curl -s http://169.254.169.254/latest/meta-data/instance-id)</h1>" > /usr/share/nginx/html/index.html
  EOF

  root_block_device {
    volume_type = "gp3"
    volume_size = var.onprem_nginx.volume_size
  }

  tags = {
    Name    = "${var.project_name}-onprem-nginx"
    Project = var.project_name
  }
}
