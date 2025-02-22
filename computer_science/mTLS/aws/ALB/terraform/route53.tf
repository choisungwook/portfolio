resource "aws_route53_record" "nginx" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  weighted_routing_policy {
    weight = 100
  }

  set_identifier = "primary"

  alias {
    name                   = aws_lb.nginx.dns_name
    zone_id                = aws_lb.nginx.zone_id
    evaluate_target_health = true
  }
}
