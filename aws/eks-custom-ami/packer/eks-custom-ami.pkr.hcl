packer {
  required_plugins {
    amazon = {
      version = "~> 1.8"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "eks" {
  ami_name      = "${var.ami_name_prefix}-${var.eks_version}-${formatdate("YYYYMMDDHHmmss", timestamp())}"
  instance_type = var.instance_type
  region        = var.aws_region

  source_ami_filter {
    filters = {
      "name"                = "amazon-eks-node-al2023-x86_64-standard-${var.eks_version}-*"
      "virtualization-type" = "hvm"
      "root-device-type"    = "ebs"
    }
    owners      = ["amazon"]
    most_recent = true
  }

  ssh_username = "ec2-user"

  launch_block_device_mappings {
    device_name = "/dev/xvda"
    volume_size = var.volume_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name       = "${var.ami_name_prefix}-${var.eks_version}"
    Project    = var.project_name
    ManagedBy  = "Packer"
    EKSVersion = var.eks_version
  }
}

build {
  name    = "eks-custom-ami"
  sources = ["source.amazon-ebs.eks"]

  provisioner "shell" {
    script = "${path.root}/scripts/setup.sh"
  }
}
