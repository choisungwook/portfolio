data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name = "availability-zone"
    values = [
      "${var.region}a",
      "${var.region}c",
      "${var.region}b",
      "${var.region}d"
    ]
  }
}

data "aws_availability_zones" "available" {
  state = "available"
  filter {
    name   = "zone-name"
    values = ["${var.region}a", "${var.region}c", "${var.region}b", "${var.region}d"]
  }
}
