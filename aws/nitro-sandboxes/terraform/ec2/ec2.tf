resource "aws_key_pair" "parent" {
  key_name   = var.project_name
  public_key = file(pathexpand(var.ssh_public_key_path))
}

resource "aws_instance" "parent" {
  ami                    = data.aws_ssm_parameter.al2023_kernel_618.value
  instance_type          = var.instance_type
  subnet_id              = module.vpc.public_subnets[0]
  vpc_security_group_ids = [aws_security_group.parent.id]
  key_name               = aws_key_pair.parent.key_name

  # Nitro Sandboxes는 Nitro Enclaves 드라이버로 VM을 만든다. 이 값이 없으면 /dev/nitro_enclaves가 생기지 않는다
  enclave_options {
    enabled = true
  }

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-parent"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}
