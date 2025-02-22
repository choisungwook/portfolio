data "aws_acm_certificate" "my_acm" {
  count = var.use_acm ? 1 : 0

  domain   = var.acm_domain
  statuses = ["ISSUED"]
}
