resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.project_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Phase 2: CloudFront Function - abc.choilab.xyz만 redirect, def.choilab.xyz는 통과
resource "aws_cloudfront_function" "redirect" {
  name    = "${var.project_name}-redirect"
  runtime = "cloudfront-js-2.0"
  publish = true

  code = <<-JS
    function handler(event) {
      var host = event.request.headers.host.value;
      if (host === '${var.redirect_source_domain}') {
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: {
            'location': { value: 'http://${var.s3_hosting_domain}' + event.request.uri }
          }
        };
      }
      return event.request;
    }
  JS
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "hello.html"
  comment             = "CloudFront for ${var.s3_hosting_domain}"

  # Phase 1: def.choilab.xyz only
  # Phase 2 (enable_redirect=true): add abc.choilab.xyz
  aliases = var.enable_redirect ? [var.s3_hosting_domain, var.redirect_source_domain] : [var.s3_hosting_domain]

  origin {
    domain_name              = aws_s3_bucket.origin.bucket_regional_domain_name
    origin_id                = "s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-origin"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    # Phase 2: enable_redirect=true이면 Function 연결
    dynamic "function_association" {
      for_each = var.enable_redirect ? [1] : []

      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.redirect.arn
      }
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "${var.project_name}-distribution"
  }
}
