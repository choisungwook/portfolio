resource "aws_route_table" "demo-route-public" {
  vpc_id = aws_vpc.demo-vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo-igw.id
  }

  tags = {
    Name = "demo-route-publicsubent"
  }
}

resource "aws_route_table" "demo-route-private" {
  count = length(var.private_subnet)
  vpc_id = aws_vpc.demo-vpc.id

  tags = {
    Name = "demo-route-privatesubent"
  }
}