resource "aws_vpc_peering_connection" "a_to_b" {
  vpc_id      = aws_vpc.a.id
  peer_vpc_id = aws_vpc.b.id
  auto_accept = true

  depends_on = [aws_vpc_ipv4_cidr_block_association.a_secondary]

  tags = {
    Name = "${var.project_name}-a-to-b"
  }
}
