resource "aws_instance" "app" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnet.app.id
  vpc_security_group_ids      = [aws_security_group.app.id]
  iam_instance_profile        = aws_iam_instance_profile.app.name
  associate_public_ip_address = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    app_py         = base64encode(file("${path.module}/../app/app.py"))
    region         = var.aws_region
    app_port       = var.app_port
    db_host        = aws_rds_cluster.aurora.endpoint
    db_name        = var.db_name
    pw_user        = local.password_db_user
    iam_user       = local.iam_db_user
    mode_param     = aws_ssm_parameter.auth_mode.name
    password_param = aws_ssm_parameter.app_password.name
  })
  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-app"
  }
}
