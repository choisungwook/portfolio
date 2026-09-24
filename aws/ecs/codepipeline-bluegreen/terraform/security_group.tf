resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb"
  description = "ALB: production and test listeners"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_production" {
  security_group_id = aws_security_group.alb.id
  description       = "production traffic"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

# lifecycle hook Lambda는 VPC 밖에서 test listener를 호출하므로 고정 IP가 없다. 실습이라 전체 개방.
resource "aws_vpc_security_group_ingress_rule" "alb_test" {
  security_group_id = aws_security_group.alb.id
  description       = "test traffic, called by the lifecycle hook Lambda"
  ip_protocol       = "tcp"
  from_port         = var.test_listener_port
  to_port           = var.test_listener_port
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "task" {
  name        = "${var.project_name}-task"
  description = "Fargate tasks, reachable only from the ALB"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "task_from_alb" {
  security_group_id            = aws_security_group.task.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "task_all" {
  security_group_id = aws_security_group.task.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
