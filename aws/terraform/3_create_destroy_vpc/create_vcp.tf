provider "aws" {
  region = "ap-northeast-2"
}

resource "aws_vpc" "demo-vpc1" {
  cidr_block       = "10.0.0.0/16"
  instance_tenancy = "default"
  tags = {
    Name = "demo1"
  }
}

resource "aws_vpc" "demo-vpc2" {
  cidr_block       = "10.0.0.0/16"
  instance_tenancy = "default"
}