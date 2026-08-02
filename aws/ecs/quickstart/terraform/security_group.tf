resource "aws_security_group" "web" {
  name        = "${var.project_name}-web"
  description = "Allow HTTP from my IP to ECS tasks"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "http_from_my_ip" {
  security_group_id = aws_security_group.web.id
  description       = "HTTP from my IP"
  cidr_ipv4         = "${chomp(data.http.my_ip.response_body)}/32"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.web.id
  description       = "Allow all egress (image pull, logs)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
