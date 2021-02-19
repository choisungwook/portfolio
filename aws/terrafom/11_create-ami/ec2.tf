resource "aws_instance" "web" {
  ami = var.ubuntu-ami
  instance_type = "t2.nano"
  key_name = aws_key_pair.demo-keypair.key_name

  tags = {
    Name = "demo-instance"
  }
}

# EC2 instance user data
resource "null_resource" "web" {
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
      "until [ -f /var/lib/cloud/instance/boot-finished ]; do sleep 1; done",
      "sudo apt update",
      "sudo apt install apache2 -y && sudo systemctl start apache2",
      "sudo chown -R ubuntu:ubuntu /var/www/html",
      "echo 'hello world' > /var/www/html/index.html"
    ]
  }
}