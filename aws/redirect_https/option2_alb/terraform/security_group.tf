# =============================================================================
# ALB 1: nginx ALB 보안 그룹
# =============================================================================

resource "aws_security_group" "alb_nginx" {
  name        = "${var.project_name}-alb-nginx-sg"
  description = "Security group for nginx ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-alb-nginx-sg"
  }
}

# =============================================================================
# ALB 2: redirect ALB 보안 그룹
# =============================================================================

resource "aws_security_group" "alb_redirect" {
  name        = "${var.project_name}-alb-redirect-sg"
  description = "Security group for redirect ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-alb-redirect-sg"
  }
}

# =============================================================================
# EC2 보안 그룹
# =============================================================================

resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "Security group for EC2 nginx"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "HTTP from nginx ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_nginx.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ec2-sg"
  }
}
