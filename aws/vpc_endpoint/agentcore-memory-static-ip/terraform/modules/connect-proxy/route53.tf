resource "aws_route53_record" "proxy" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = var.proxy_domain
  type    = "A"
  alias {
    name                   = aws_lb.proxy.dns_name
    zone_id                = aws_lb.proxy.zone_id
    evaluate_target_health = true
  }
  lifecycle {
    precondition {
      condition     = !data.aws_route53_zone.proxy[0].private_zone
      error_message = "DNS-unmodifiable clients need an already delegated public hosted zone."
    }
  }
}
