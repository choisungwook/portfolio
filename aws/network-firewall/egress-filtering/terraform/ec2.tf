# One instance per AZ. egress-probe is a stand-in for a running service:
# it calls an allowed and a to-be-blocked domain every 2 seconds.
resource "aws_instance" "app" {
  for_each = local.app_subnets

  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.app[each.key].id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  user_data              = file("${path.module}/egress-probe.sh")

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-app-${each.key}"
  }

  # The NAT route must exist before boot, or the probe and SSM agent start offline.
  depends_on = [aws_route.app_default, aws_route_table_association.app]
}
