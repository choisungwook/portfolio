locals {
  al2023_ami_name = var.arch == "arm64" ? "al2023-ami-*-kernel-6.1-arm64" : "al2023-ami-*-kernel-6.1-x86_64"
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = [local.al2023_ami_name]
  }

  filter {
    name   = "architecture"
    values = [var.arch]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
