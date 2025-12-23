resource "aws_iam_role" "ebpf_instance_role" {
  name = "ebpf-lab"

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
}

resource "aws_iam_role_policy_attachment" "ssm_managed_instance_core" {
  role       = aws_iam_role.ebpf_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ebpf_instance_profile" {
  name = "ebpf-lab-instance-profile"
  role = aws_iam_role.ebpf_instance_role.name
}

resource "aws_security_group" "ebpf_lab_sg" {
  name        = "ebpf-lab"
  description = "Security group for eBPF lab instance - egress only"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "ebpf-lab-sg"
  }
}

resource "aws_instance" "ebpf_lab" {
  ami           = data.aws_ami.amazon_linux_3.id
  instance_type = var.instance_type

  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.ebpf_lab_sg.id]
  iam_instance_profile        = aws_iam_instance_profile.ebpf_instance_profile.name
  associate_public_ip_address = true

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  user_data = <<-EOF
              #!/bin/bash
              sleep 0.5;

              dnf update -y

              dnf groupinstall -y "Development Tools"
              dnf install -y kernel-devel-$(uname -r) clang llvm bpftool
              dnf install -y libbpf-devel
              dnf install -y git vim htop gdb
              dnf install -y golang

              # Install bpftop
              curl -fLJ https://github.com/Netflix/bpftop/releases/latest/download/bpftop-x86_64-unknown-linux-gnu -o bpftop && chmod +x bpftop && mv bpftop /usr/local/bin/bpftop
              EOF

  tags = {
    Name = "ebpf-lab-instance"
  }
}
