data "aws_caller_identity" "lab" {}

data "aws_partition" "lab" {}

data "aws_availability_zones" "lab" {
  state = "available"
}
