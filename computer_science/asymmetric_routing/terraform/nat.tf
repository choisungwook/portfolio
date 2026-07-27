# A private NAT gateway has no elastic IP. It rewrites the source address to one
# of its own subnet, which is the whole point here: the server VPC will only
# route the NAT CIDR back.
resource "aws_nat_gateway" "private" {
  count = var.forward_path == "pnat" ? 1 : 0

  connectivity_type = "private"
  subnet_id         = aws_subnet.a_nat.id

  tags = {
    Name = "${var.project_name}-private"
  }
}
