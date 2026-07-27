# VPC A is the client side. It carries a second, non overlapping CIDR that only
# the private NAT gateway lives in.
resource "aws_vpc" "a" {
  cidr_block           = var.vpc_a_cidr
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-a"
  }
}

resource "aws_vpc_ipv4_cidr_block_association" "a_secondary" {
  vpc_id     = aws_vpc.a.id
  cidr_block = var.vpc_a_secondary_cidr
}

resource "aws_internet_gateway" "a" {
  vpc_id = aws_vpc.a.id

  tags = {
    Name = "${var.project_name}-a"
  }
}

# The three routable subnets share one route table, so one route entry decides
# the forward path for the whole client side.
resource "aws_subnet" "a_client" {
  vpc_id                  = aws_vpc.a.id
  cidr_block              = cidrsubnet(var.vpc_a_cidr, 8, 1)
  availability_zone       = local.az
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-a-client"
  }
}

resource "aws_subnet" "a_probe" {
  vpc_id                  = aws_vpc.a.id
  cidr_block              = cidrsubnet(var.vpc_a_cidr, 8, 2)
  availability_zone       = local.az
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-a-probe"
  }
}

# Home of the client's second ENI. Same AZ, different subnet: that is what makes
# the dual homed asymmetry possible.
resource "aws_subnet" "a_client_secondary" {
  vpc_id            = aws_vpc.a.id
  cidr_block        = cidrsubnet(var.vpc_a_cidr, 8, 3)
  availability_zone = local.az

  tags = {
    Name = "${var.project_name}-a-client-secondary"
  }
}

resource "aws_subnet" "a_nat" {
  vpc_id            = aws_vpc.a.id
  cidr_block        = cidrsubnet(var.vpc_a_secondary_cidr, 8, 1)
  availability_zone = local.az

  depends_on = [aws_vpc_ipv4_cidr_block_association.a_secondary]

  tags = {
    Name = "${var.project_name}-a-nat"
  }
}

resource "aws_route_table" "a_main" {
  vpc_id = aws_vpc.a.id

  tags = {
    Name = "${var.project_name}-a-main"
  }
}

resource "aws_route" "a_main_default" {
  route_table_id         = aws_route_table.a_main.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.a.id
}

# The switch this whole lab turns on: reach VPC B directly, or through the
# private NAT gateway.
resource "aws_route" "a_main_to_b_direct" {
  count = var.forward_path == "direct" ? 1 : 0

  route_table_id            = aws_route_table.a_main.id
  destination_cidr_block    = var.vpc_b_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.a_to_b.id
}

resource "aws_route" "a_main_to_b_via_nat" {
  count = var.forward_path == "pnat" ? 1 : 0

  route_table_id         = aws_route_table.a_main.id
  destination_cidr_block = var.vpc_b_cidr
  nat_gateway_id         = aws_nat_gateway.private[0].id
}

resource "aws_route_table_association" "a_client" {
  subnet_id      = aws_subnet.a_client.id
  route_table_id = aws_route_table.a_main.id
}

resource "aws_route_table_association" "a_probe" {
  subnet_id      = aws_subnet.a_probe.id
  route_table_id = aws_route_table.a_main.id
}

resource "aws_route_table_association" "a_client_secondary" {
  subnet_id      = aws_subnet.a_client_secondary.id
  route_table_id = aws_route_table.a_main.id
}

# The NAT subnet needs its own table. If it used a_main it would send traffic
# back into the NAT gateway and loop.
resource "aws_route_table" "a_nat" {
  vpc_id = aws_vpc.a.id

  tags = {
    Name = "${var.project_name}-a-nat"
  }
}

resource "aws_route" "a_nat_to_b" {
  route_table_id            = aws_route_table.a_nat.id
  destination_cidr_block    = var.vpc_b_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.a_to_b.id
}

resource "aws_route_table_association" "a_nat" {
  subnet_id      = aws_subnet.a_nat.id
  route_table_id = aws_route_table.a_nat.id
}

# VPC B is the server side, and it stands in for a network somebody else runs.
resource "aws_vpc" "b" {
  cidr_block           = var.vpc_b_cidr
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-b"
  }
}

resource "aws_internet_gateway" "b" {
  vpc_id = aws_vpc.b.id

  tags = {
    Name = "${var.project_name}-b"
  }
}

resource "aws_subnet" "b_server" {
  vpc_id                  = aws_vpc.b.id
  cidr_block              = cidrsubnet(var.vpc_b_cidr, 8, 1)
  availability_zone       = local.az
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-b-server"
  }
}

resource "aws_route_table" "b_main" {
  vpc_id = aws_vpc.b.id

  tags = {
    Name = "${var.project_name}-b-main"
  }
}

resource "aws_route" "b_main_default" {
  route_table_id         = aws_route_table.b_main.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.b.id
}

# VPC B routes the NAT CIDR back, and nothing else. There is deliberately no
# route for var.vpc_a_cidr: that missing entry is the failure the lab studies.
resource "aws_route" "b_main_to_a_nat" {
  route_table_id            = aws_route_table.b_main.id
  destination_cidr_block    = var.vpc_a_secondary_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.a_to_b.id
}

resource "aws_route_table_association" "b_server" {
  subnet_id      = aws_subnet.b_server.id
  route_table_id = aws_route_table.b_main.id
}
