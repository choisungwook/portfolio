## 개요
* terraform code 정리

# EC2

## Spot instance

```hcl
resource "aws_spot_instance_request" "nginx" {
  ami                  = data.aws_ami.ubuntu.id
  spot_price           = var.spot_price
  instance_type        = var.spot_instance_type
  spot_type            = var.spot_type
  wait_for_fulfillment = "true"
  security_groups      = [aws_security_group.nginx.id]
  subnet_id            = var.subnet_id

  tags = {
    Name = "${var.tag_prefix}-nginx"
  }
}

variable "tag_prefix" {
  description = "tag prefix"
  type        = string
  default     = "Example1"
}

variable "vpc_id" {
  description = "id"
  type        = string
}

variable "subnet_id" {
  description = "subnets id"
  type        = string
}

variable "spot_instance_type" {
  description = "spot instance type"
  type        = string
  default     = "t4g.nano"
}

variable "spot_type" {
  description = "spot type"
  type        = string
  default     = "one-time"

}

variable "spot_price" {
  description = "spot price"
  type        = string
  default     = "0.01"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy" "systems_manager" {
  arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}


resource "aws_security_group" "nginx" {
  name        = "terraform-test-nginx"
  description = "${var.tag_prefix}-nginx security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "http"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "icmp"
    from_port   = 0
    to_port     = 0
    protocol    = "icmp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_instance_profile" "ssm" {
  name = "terraform-test-ssm-instanceprofile"
  role = aws_iam_role.ssm.name
}

resource "aws_iam_role" "ssm" {
  name               = "terraform-test-ssm-iamrole"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ssm.name
  policy_arn = data.aws_iam_policy.systems_manager.arn
}
```
