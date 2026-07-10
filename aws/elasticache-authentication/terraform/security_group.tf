resource "aws_security_group" "app" {
  name_prefix = "${var.project_name}-app-"
  description = "App host: no inbound, egress to ElastiCache and the internet"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.project_name}-app"
  }
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "SSM control traffic, image pulls, and ElastiCache TLS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "elasticache" {
  name_prefix = "${var.project_name}-elasticache-"
  description = "Allow Valkey only from the app host"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.project_name}-elasticache"
  }
}

resource "aws_vpc_security_group_ingress_rule" "elasticache_from_app" {
  security_group_id            = aws_security_group.elasticache.id
  description                  = "TLS Valkey from the app security group"
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 6379
  ip_protocol                  = "tcp"
  to_port                      = 6379
}
