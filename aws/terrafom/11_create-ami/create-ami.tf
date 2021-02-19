resource "aws_ami_from_instance" "demo" {
    depends_on = [null_resource.web]
    name = "demo-ami"
    source_instance_id = aws_instance.web.id
}