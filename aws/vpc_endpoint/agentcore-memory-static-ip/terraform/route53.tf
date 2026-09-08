# S05 negative test: an own-domain name that resolves to the STS NLB. AWS's certificate
# does not carry this name, so TLS verification must fail before any request.
#
# When route53_zone_id is null the record is not created; put an A record for
# sts_alias_domain -> STS NLB EIP in whichever DNS provider is authoritative instead.
data "aws_route53_zone" "lab" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
}

resource "aws_route53_record" "sts_alias" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = data.aws_route53_zone.lab[0].zone_id
  name    = var.sts_alias_domain
  type    = "A"
  alias {
    name                   = aws_lb.api["sts"].dns_name
    zone_id                = aws_lb.api["sts"].zone_id
    evaluate_target_health = true
  }
}

# S06: own-domain names for the TLS NLBs. Same zone rule as above; with another DNS
# provider add A <tls_alias_domains[svc]> -> TLS NLB EIP records by hand.
resource "aws_route53_record" "tls_alias" {
  for_each = var.route53_zone_id == null ? {} : local.tls_services
  zone_id  = data.aws_route53_zone.lab[0].zone_id
  name     = var.tls_alias_domains[each.key]
  type     = "A"
  alias {
    name                   = aws_lb.tls[each.key].dns_name
    zone_id                = aws_lb.tls[each.key].zone_id
    evaluate_target_health = true
  }
}
