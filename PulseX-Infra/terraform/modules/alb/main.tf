# Application Load Balancer Module

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Security Group for ALB
resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-${var.environment}-alb"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  # HTTP access from anywhere
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS access from anywhere
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Health check port from ALB to targets
  egress {
    description = "HTTP to targets"
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    security_groups = [var.ecs_security_group_id]
  }

  egress {
    description      = "HTTPS health check"
    from_port        = var.container_port
    to_port          = var.container_port
    protocol         = "tcp"
    security_groups  = [var.ecs_security_group_id]
  }

  egress {
    description      = "All outbound"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-sg"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${var.name_prefix}-${var.environment}-alb"
  internal           = var.internal
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = var.subnet_ids

  enable_deletion_protection = var.enable_deletion_protection

  # Access logs
  access_logs {
    bucket  = var.access_logs_bucket
    prefix  = "${var.name_prefix}-${var.environment}-alb-logs"
    enabled = var.enable_access_logs
  }

  # Enable cross-zone load balancing
  enable_cross_zone_load_balancing = true

  # Enable HTTP/2
  ip_address_type = "ipv4"

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# HTTP Listener (redirects to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-http-listener"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-https-listener"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Target Group
resource "aws_lb_target_group" "main" {
  name     = "${var.name_prefix}-${var.environment}-tg"
  port     = var.container_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id
  target_type = "ip"

  # Health check configuration
  health_check {
    enabled             = true
    healthy_threshold   = var.health_check_healthy_threshold
    interval            = var.health_check_interval
    matcher             = var.health_check_matcher
    path                = var.health_check_path
    port                = var.container_port
    protocol            = "HTTP"
    timeout             = var.health_check_timeout
    unhealthy_threshold = var.health_check_unhealthy_threshold
  }

  # Stickiness
  stickiness {
    type            = var.stickiness_type
    cookie_duration = var.stickiness_cookie_duration
    enabled         = var.stickiness_enabled
  }

  # Deregistration delay
  deregistration_delay = var.deregistration_delay

  # Protocol version
  protocol_version = "HTTP1"

  # Target health configuration
  target_health {
    unhealthy_host_grace_period = 300
    healthy_host_grace_period   = 0
  }

  # Load balancing algorithm
  load_balancing_algorithm_type = "round_robin"

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-tg"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# WAFv2 Web ACL Association (if WAF is enabled)
resource "aws_wafv2_web_acl_association" "main" {
  count = var.waf_web_acl_arn != "" ? 1 : 0

  resource_arn = aws_lb.main.arn
  web_acl_arn  = var.waf_web_acl_arn
}

# DNS Record (Route53)
resource "aws_route53_record" "main" {
  count   = var.zone_id != "" ? 1 : 0
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id               = aws_lb.main.zone_id
    evaluate_target_health = true
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-dns"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# CloudWatch Metric Alarms for ALB
resource "aws_cloudwatch_metric_alarm" "target_response_time" {
  alarm_name          = "${var.name_prefix}-${var.environment}-alb-high-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Average"
  threshold           = "5.0"  # 5 seconds
  alarm_description   = "This metric monitors ALB target response time"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-high-response-time"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "http_code_5xx" {
  alarm_name          = "${var.name_prefix}-${var.environment}-alb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors ALB 5XX error count"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-5xx-errors"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "http_code_4xx" {
  alarm_name          = "${var.name_prefix}-${var.environment}-alb-4xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "HTTPCode_Target_4XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "50"
  alarm_description   = "This metric monitors ALB 4XX error count"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-4xx-errors"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "target_connection_error_count" {
  alarm_name          = "${var.name_prefix}-${var.environment}-alb-connection-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "TargetConnectionErrorCount"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "This metric monitors ALB target connection errors"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-connection-errors"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "aws_cloudwatch_metric_alarm" "rejected_connection_count" {
  alarm_name          = "${var.name_prefix}-${var.environment}-alb-rejected-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "RejectedConnectionCount"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors ALB rejected connection count"
  alarm_actions       = var.alarm_sns_topic_arn

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-rejected-connections"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# ALB Access Logs Bucket (if not provided)
resource "aws_s3_bucket" "alb_logs" {
  count = var.create_access_logs_bucket ? 1 : 0

  bucket = "${var.name_prefix}-${var.environment}-${random_id.alb_logs_bucket.hex}-alb-logs"

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-logs"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

resource "random_id" "alb_logs_bucket" {
  byte_length = 8
}

resource "aws_s3_bucket_versioning" "alb_logs" {
  count  = var.create_access_logs_bucket ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  count  = var.create_access_logs_bucket ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  count  = var.create_access_logs_bucket ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  rule {
    id     = "alb_logs_lifecycle"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 60
      storage_class = "GLACIER"
    }

    transition {
      days          = 90
      storage_class = "DEEP_ARCHIVE"
    }

    expiration {
      days = 365
    }
  }
}

# IAM Policy for ALB access logs
resource "aws_s3_bucket_policy" "alb_logs" {
  count  = var.create_access_logs_bucket ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action = [
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.alb_logs[0].arn}/*",
          "${aws_s3_bucket.alb_logs[0].arn}/*/*"
        ]
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action = [
          "s3:GetBucketAcl"
        ]
        Resource = [
          aws_s3_bucket.alb_logs[0].arn
        ]
      }
    ]
  })
}