data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_iam_policy_document" "nexus_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "nexus" {
  name               = "${var.name_prefix}-nexus-role"
  assume_role_policy = data.aws_iam_policy_document.nexus_assume_role.json

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-role"
    }
  )
}

resource "aws_iam_role_policy_attachment" "nexus_ssm" {
  role       = aws_iam_role.nexus.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nexus" {
  name = "${var.name_prefix}-nexus-profile"
  role = aws_iam_role.nexus.name

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus-profile"
    }
  )
}

resource "aws_instance" "nexus" {
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.nexus_instance_type
  subnet_id     = var.nexus_subnet_id

  vpc_security_group_ids = [aws_security_group.nexus_ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.nexus.name

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.nexus_root_volume_size
    encrypted             = true
    delete_on_termination = true

    tags = merge(
      var.tags,
      {
        Name = "${var.name_prefix}-nexus-root-volume"
      }
    )
  }

  user_data = templatefile("${path.module}/userdata.sh", {
    nexus_admin_password = var.nexus_admin_password
  })

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nexus"
    }
  )
}
