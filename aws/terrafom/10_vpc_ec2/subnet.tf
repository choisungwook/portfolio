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