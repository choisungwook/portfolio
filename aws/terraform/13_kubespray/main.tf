# region
provider "aws" {
  region = "us-east-2"
}

# data
variable "az" {
  type        = list(string)
  default     = [
      "us-east-2a",
      "us-east-2b",
      "us-east-2c",

  ]
  description = "ohio region az"
}

variable "public_subnet" {
  type        = list(string)
  default     = [
    "10.0.0.0/24",
    "10.0.1.0/24",
    "10.0.2.0/24"
  ]

  description = "demo public subnet"
}

variable "private_subnet" {
  type        = list(string)
  default     = [
    "10.0.3.0/24",
    "10.0.4.0/24",
    "10.0.5.0/24",
  ]
  description = "demo private subnet"
}


# vpc
resource "aws_vpc" "demo-vpc" {
    cidr_block = "10.0.0.0/16"

    tags = {
        Name = "demo-vpc"
    }
}

# subnet
resource "aws_subnet" "demo-public-subnet" {
    count = length(var.public_subnet)
    
    cidr_block = var.public_subnet[count.index]
    availability_zone = var.az[count.index]
    vpc_id = aws_vpc.demo-vpc.id
    map_public_ip_on_launch = true

    tags = {
        Name = "demo-public-subnet"
    }
}

resource "aws_subnet" "demo-private-subnet" {
    count = length(var.private_subnet)

    cidr_block = var.private_subnet[count.index]
    availability_zone = var.az[count.index]
    vpc_id = aws_vpc.demo-vpc.id
    map_public_ip_on_launch = true
    
    tags = {
        Name = "demo-private-subnet"
    }
}

# route-table
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

  route {
    cidr_block = "0.0.0.0/0"
    nat_gateway_id = element(aws_nat_gateway.demo-nat-gateway.*.id, count.index)
  }

  tags = {
    Name = "demo-route-privatesubent"
  }
}

# route-table assoic
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

resource "aws_internet_gateway" "demo-igw" {
  vpc_id = aws_vpc.demo-vpc.id

  tags = {
    Name = "demo-igw"
  }
}

# eip for NAT
resource "aws_eip" "demo-nat-eip" {
  count = length(var.public_subnet)
  vpc   = true

  tags = {
    Name = "demo-nat-eip"
  }
}

# NAT Gateway
resource "aws_nat_gateway" "demo-nat-gateway" {
  count         = length(var.public_subnet)
  allocation_id = element(aws_eip.demo-nat-eip.*.id, count.index)
  subnet_id     = element(aws_subnet.demo-public-subnet.*.id, count.index)

  depends_on = [aws_internet_gateway.demo-igw]

  tags = {
    Name = "demo-nat"
  }
}