provider "aws" {
  region = "ap-northeast-2"
}

resource "aws_vpc" "terraform-vpc1" {
  cidr_block = "172.20.0.0/16"
  instance_tenancy = "default"

  tags = {
    Name = "tf-demo1"
  }
}

# az: ap-northeast-2a
resource "aws_subnet" "terraform-subent1" {
  vpc_id     = aws_vpc.terraform-vpc1.id
  cidr_block = "172.20.1.0/24"
  availability_zone = "ap-northeast-2a"

  tags = {
    Name = "tf-subnet1"
  }
}

# az: ap-northeast-2b
resource "aws_subnet" "terraform-subent2" {
  vpc_id     = aws_vpc.terraform-vpc1.id
  cidr_block = "172.20.2.0/24"
  availability_zone = "ap-northeast-2b"

  tags = {
    Name = "tf-subnet2"
  }
}