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

resource "aws_subnet" "terraform-subent1" {
  vpc_id     = aws_vpc.terraform-vpc1.id
  cidr_block = "172.20.1.0/24"

  tags = {
    Name = "tf-subnet1"
  }
}