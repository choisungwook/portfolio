provider "aws" {
  region = "ap-northeast-2"
}

# vpc
resource "aws_vpc" "terraform-vpc1" {
  cidr_block = "172.20.0.0/16"
  instance_tenancy = "default"

  tags = {
    Name = "tf-vpc1"
  }
}

# subnet
# az: ap-northeast-2a
resource "aws_subnet" "terraform-subent1" {
  vpc_id     = aws_vpc.terraform-vpc1.id
  cidr_block = "172.20.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true

  tags = {
    Name = "tf-subnet1"
  }
}

# internet gateway
resource "aws_internet_gateway" "terraform-gw1" {
  vpc_id = aws_vpc.terraform-vpc1.id

  tags = {
    Name = "tf-igw1"
  }
}

# routing table
resource "aws_route_table" "terraform-demo-routetable1" {
  vpc_id = aws_vpc.terraform-vpc1.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.terraform-gw1.id
  }

  tags = {
    Name = "tf-public-route1"
  }
}

resource "aws_route_table_association" "terraform-demo-reouteass" {
  subnet_id      = aws_subnet.terraform-subent1.id
  route_table_id = aws_route_table.terraform-demo-routetable1.id
}