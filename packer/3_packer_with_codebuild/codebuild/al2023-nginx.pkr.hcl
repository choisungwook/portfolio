packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.8"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "nginx" {
  ami_name      = "al2023-nginx-{{timestamp}}"
  instance_type = "t4g.medium"
  region        = "ap-northeast-2"

  source_ami_filter {
    filters = {
      name                = "al2023-ami-minimal-2023.6.*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["137112412989"] # Amazon
    most_recent = true
  }

  ssh_username = "ec2-user"
}

build {
  name = "nginx-golden-image"
  sources = [
    "source.amazon-ebs.nginx"
  ]
  provisioner "shell" {
    inline = [
      "sudo yum -y install nginx",
      "sudo systemctl enable nginx",
    ]
  }
}
