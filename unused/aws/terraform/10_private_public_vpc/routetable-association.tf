resource "aws_route_table_association" "demo-public" {
    count   = length(var.public_subnet)

    subnet_id      = aws_subnet.demo-public-subnet[count.index].id
    route_table_id = aws_route_table.demo-route-public.id
}

resource "aws_route_table_association" "demo-private" {
    count = length(var.private_subnet)

    subnet_id      = aws_subnet.demo-private-subnet[count.index].id
    route_table_id = aws_route_table.demo-route-private[count.index].id
}