provider "aws" {
  region = "ap-northeast-2"
}

resource "aws_key_pair" "demo-keypair" {
  key_name   = "deployer-key"
  public_key = file("./test.pub")
}

resource "aws_instance" "web" {
  ami = "ami-0b50511490117e709"
  instance_type = "t2.nano"
  key_name = aws_key_pair.demo-keypair.key_name

  tags = {
    Name = "demo-instance"
  }
}

resource "null_resource" "name" {
  depends_on = [aws_instance.web]

  connection {
    type = "ssh"
    user = "ubuntu"
    private_key = file("./test")
    host = aws_instance.web.public_ip
    timeout = "1m"
  }

  provisioner "remote-exec" {
    inline = [      
      "sudo apt update",
      "sudo apt install apache2 -y && sudo systemctl start apache2",
      "sudo chown -R ubuntu:ubuntu /var/www/html",
      "echo 'hello world' > /var/www/html/index.html"
    ]
  }
}