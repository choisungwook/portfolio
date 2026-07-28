# A volume attached to nothing. It bills the same as one doing work.
resource "aws_ebs_volume" "orphan" {
  availability_zone = aws_instance.tagged.availability_zone
  size              = var.orphan_volume_size
  type              = "gp3"
  encrypted         = true

  tags = {
    Name = "${var.project_name}-orphan"
  }

  lifecycle {
    ignore_changes = [tags["c7n_orphan"]]
  }
}
