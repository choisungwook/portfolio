data "template_file" "user_data" {
  template = file("./install_apache2.sh")
}

resource "aws_instance" "web" {
  ami = "ami-0b50511490117e709"
  instance_type = "t2.nano"
  key_name = aws_key_pair.demo-keypair.key_name
  user_data = data.template_file.user_data.rendered
  
  tags = {
    Name = "demo-instance"
  }
}