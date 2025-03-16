resource "aws_security_group" "ec2" {
  name        = var.ec2_name
  description = "Security group for EC2"
  vpc_id      = var.vpc_id

  tags = {
    Name        = "${var.ec2_name}"
    environment = "test"
  }
}

resource "aws_security_group_rule" "ec2_ingress_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ec2_ingress_ipsec_ike" {
  type              = "ingress"
  from_port         = 500
  to_port           = 500
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ec2_ingress_ipsec_nat_t" {
  type              = "ingress"
  from_port         = 4500
  to_port           = 4500
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ec2_ingress_ipsec_esp" {
  type              = "ingress"
  from_port         = 0
  to_port           = 0
  protocol          = "50" # ESP 프로토콜
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ec2_ingress_ipsec_ah" {
  type              = "ingress"
  from_port         = 0
  to_port           = 0
  protocol          = "51" # AH 프로토콜 (선택 사항)
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ec2_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ec2.id
}
