locals {
  image_names = {
    al2023 = var.arch == "arm64" ? "al2023-ami-*-kernel-6.1-arm64" : "al2023-ami-*-kernel-6.1-x86_64"
    ubuntu = var.arch == "arm64" ? "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*" : "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
  }
  routes = {
    for service in var.services :
    "${service.hostname}:443" => trimprefix(service.endpoint_url, "https://")
  }
}
data "aws_ami" "proxy" {
  most_recent = true
  owners      = var.os_type == "al2023" ? ["amazon"] : ["099720109477"]
  filter {
    name   = "name"
    values = [local.image_names[var.os_type]]
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
data "aws_route53_zone" "proxy" {
  count        = var.route53_zone_id == null ? 0 : 1
  zone_id      = var.route53_zone_id
  private_zone = false
}
