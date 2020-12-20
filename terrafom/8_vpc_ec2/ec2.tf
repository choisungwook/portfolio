# key pair
resource "aws_key_pair" "demo-key" {
  key_name = "tf-demo"
  public_key = file("~/.ssh/aws.pub")
}

# security group
resource "aws_security_group" "demo-securitygroup" {
  name = "demo-securitygroup"
  description = "Allow SSH port from all"
  vpc_id = aws_vpc.terraform-vpc1.id

  ingress {
    from_port = 22
    to_port = 22
    protocol = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "demo-securitygroup"
  }
}

# ec2 instance
resource "aws_instance" "ubuntu18" {
  ami = "ami-0e67aff698cb24c1d" # Ubuntu Server 18.04 LTS (HVM), SSD Volume Type
  instance_type = "t2.micro"
  key_name = aws_key_pair.demo-key.key_name
  subnet_id = aws_subnet.terraform-subent1.id

  vpc_security_group_ids = [
    aws_security_group.demo-securitygroup.id
  ]

  tags = {
    Name = "demo-ec2"
  }
}