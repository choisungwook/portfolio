provider "aws" {
  region = "ap-northeast-2"
}

resource "aws_key_pair" "key-demo" {
  key_name = "tf-demo"
  public_key = file("~/.ssh/aws.pub")
}