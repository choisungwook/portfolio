resource "aws_instance" "vpn_appliance" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = module.vpc.public_subnets[0]
  vpc_security_group_ids      = [aws_security_group.vpn_appliance_sg.id]
  associate_public_ip_address = true
  source_dest_check           = false # Required for routing traffic
  iam_instance_profile        = aws_iam_instance_profile.ec2_ssm_instance_profile.name

  user_data = <<-EOF
    #!/bin/bash
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "<h1>Hello from Onprem VPN Appliance: $(curl -s http://169.254.169.254/latest/meta-data/instance-id)</h1>" > /var/www/html/index.html
  EOF

  root_block_device {
    volume_type = "gp3"
    volume_size = var.ec2_volume_size
  }

  tags = {
    Name    = "${var.project_name}-onprem-vpn-appliance"
    Project = var.project_name
  }
}

resource "aws_security_group" "vpn_appliance_sg" {
  name        = "${var.project_name}-onprem-vpn-appliance-sg"
  description = "Allow VPN and management traffic"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "IKE"
    from_port   = 500
    to_port     = 500
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "IPSec NAT-T"
    from_port   = 4500
    to_port     = 4500
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "ICMP from cloud"
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = [var.cloud_vpc_cidr]
  }

  ingress {
    description = "HTTP from cloud"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.cloud_vpc_cidr]
  }

  # ingress {
  #   description = "Allow BGP from AWS"
  #   protocol    = "tcp"
  #   from_port   = 179
  #   to_port     = 179
  #   cidr_blocks = ["169.254.0.0/16"]
  # }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-onprem-vpn-appliance-sg"
    Project = var.project_name
  }
}
