resource "aws_key_pair" "demo-keypair" {
  key_name   = "deployer-key"
  public_key = file("./test.pub")
}