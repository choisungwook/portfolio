resource "aws_instance" "proxy" {
  ami                         = data.aws_ami.proxy.id
  instance_type               = var.arch == "arm64" ? "t4g.small" : "t3.small"
  subnet_id                   = values(var.subnets)[0]
  associate_public_ip_address = false
  vpc_security_group_ids      = [aws_security_group.proxy.id]
  iam_instance_profile        = aws_iam_instance_profile.proxy.name
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    proxy_code = base64encode(file("${path.module}/../../../proxy/connect_proxy.py"))
    routes     = base64encode(jsonencode(local.routes))
  })
  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }
  tags = { Name = "${var.project_name}-proxy" }
}
