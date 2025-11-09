data "http" "my_ip" {
  url = "https://api.ipify.org?format=text"
}

resource "aws_security_group" "aurora" {
  name        = "aurora-mysql-sg"
  description = "Security group for Aurora MySQL"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "MySQL access from my IP"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["${chomp(data.http.my_ip.response_body)}/32"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aurora-mysql-sg"
  }
}
