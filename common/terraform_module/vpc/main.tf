resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr

  tags = {
    Name = var.vpc_tag
  }
}

resource "aws_subnet" "public" {
  for_each = var.public_subnets

  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value["cidr"]
  availability_zone       = each.value["az"]
  map_public_ip_on_launch = true

  tags = merge({}, each.value["tags"])
}

resource "aws_subnet" "private" {
  for_each = var.private_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value["cidr"]
  availability_zone = each.value["az"]

  tags = merge({}, each.value["tags"])
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = var.vpc_tag
  }
}

resource "aws_eip" "nat_gw" {
  for_each = aws_subnet.public
  domain   = "vpc"

  tags = {
    Name = "${var.vpc_tag}-${each.key}"
  }
}

resource "aws_nat_gateway" "main" {
  for_each = aws_subnet.public

  allocation_id = aws_eip.nat_gw[each.key].id
  subnet_id     = each.value.id

  tags = {
    Name = "${var.vpc_tag}-${each.key}"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = var.vpc_tag
  }
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private

  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.vpc_tag}-${each.key}"
  }
}

resource "aws_route" "igw" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value["id"]
  route_table_id = aws_route_table.public.id
}

resource "aws_route" "nat_gw" {
  for_each = aws_route_table.private

  route_table_id         = each.value.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[replace(each.key, "private_", "public_")].id
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}
