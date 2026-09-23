resource "aws_instance" "bottlerocket" {
  ami                    = data.aws_ssm_parameter.bottlerocket_ami.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.bottlerocket.id]
  iam_instance_profile   = aws_iam_instance_profile.bottlerocket.name
  user_data              = local.bottlerocket_settings

  metadata_options {
    http_tokens = "required"
  }

  # OS 볼륨(xvda)은 AMI 크기를 그대로 쓴다. A/B 파티션 세트가 여기에 있다
  root_block_device {
    volume_type = "gp3"
    encrypted   = true
  }

  # 데이터 볼륨. 컨테이너 이미지, 로그, host container 저장소가 여기에 있다
  ebs_block_device {
    device_name = "/dev/xvdb"
    volume_type = "gp3"
    volume_size = var.data_volume_size
    encrypted   = true
  }

  tags = {
    Name = var.project_name
  }

  lifecycle {
    ignore_changes = [ami]
  }
}
