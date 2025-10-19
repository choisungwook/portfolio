data "aws_route53_zone" "this" {
  name         = var.route53_zone_name
  private_zone = false
}

resource "aws_route53_record" "nexus" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "${var.nexus_subdomain}.${var.route53_zone_name}"
  type    = "A"

  alias {
    name                   = aws_lb.nexus.dns_name
    zone_id                = aws_lb.nexus.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "nexus_internal" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "${var.nexus_internal_subdomain}.${var.route53_zone_name}"
  type    = "A"

  alias {
    name                   = aws_lb.nexus_private.dns_name
    zone_id                = aws_lb.nexus_private.zone_id
    evaluate_target_health = true
  }
}
