resource "aws_security_group" "test_vm_sg" {
  name        = "${var.project_name}-aws-cloud-test-vm-sg"
  description = "Security group for the test VM in the aws_cloud VPC"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "ICMP from on-prem"
    protocol    = "icmp"
    from_port   = -1
    to_port     = -1
    cidr_blocks = [var.on_prem_vpc_cidr]
  }

  ingress {
    description = "HTTP from on-prem"
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = [var.on_prem_vpc_cidr]
  }

  egress {
    description = "Allow all outbound traffic"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-aws-cloud-test-vm-sg"
    Project = var.project_name
  }
}

resource "aws_instance" "test_vm" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = module.vpc.private_subnets[0]
  vpc_security_group_ids = [aws_security_group.test_vm_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_ssm_instance_profile.name

  user_data = <<-EOF
    #!/bin/bash
    dnf update -y
    dnf install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "<h1>Hello from AWS Cloud VM: $(curl -s http://169.254.169.254/latest/meta-data/instance-id)</h1>" > /usr/share/nginx/html/index.html
  EOF

  root_block_device {
    volume_type = "gp3"
    volume_size = var.ec2_volume_size
  }

  tags = {
    Name    = "${var.project_name}-aws-cloud-vm"
    Project = var.project_name
  }
}
