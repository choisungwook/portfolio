resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb"
  description = "Allow HTTP from my IP to the ALB"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_from_my_ip" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from my IP"
  cidr_ipv4         = local.my_ip_cidr
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward to tasks and health check"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "task" {
  name        = "${var.project_name}-task"
  description = "Allow HTTP from the ALB and my IP to ECS tasks"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "task_http_from_alb" {
  security_group_id            = aws_security_group.task.id
  description                  = "HTTP from the ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 80
  to_port                      = 80
  ip_protocol                  = "tcp"
}

# Lets the hands-on call a task directly and compare it with the ALB.
resource "aws_vpc_security_group_ingress_rule" "task_http_from_my_ip" {
  security_group_id = aws_security_group.task.id
  description       = "HTTP from my IP"
  cidr_ipv4         = local.my_ip_cidr
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "task_all" {
  security_group_id = aws_security_group.task.id
  description       = "Image pull and log delivery"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
