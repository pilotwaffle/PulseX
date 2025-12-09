output "alb_arn" {
  description = "ARN of the ALB"
  value       = aws_lb.main.arn
}

output "alb_id" {
  description = "ID of the ALB"
  value       = aws_lb.main.id
}

output "alb_name" {
  description = "Name of the ALB"
  value       = aws_lb.main.name
}

output "alb_dns_name" {
  description = "DNS name of the ALB"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the ALB"
  value       = aws_lb.main.zone_id
}

output "alb_canonical_hosted_zone_id" {
  description = "Canonical hosted zone ID of the ALB"
  value       = aws_lb.main.canonical_hosted_zone_id
}

output "alb_arn_suffix" {
  description = "ARN suffix of the ALB"
  value       = aws_lb.main.arn_suffix
}

output "alb_ip_address_type" {
  description = "IP address type of the ALB"
  value       = aws_lb.main.ip_address_type
}

output "alb_scheme" {
  description = "Scheme of the ALB"
  value       = aws_lb.main.scheme
}

output "alb_type" {
  description = "Type of the ALB"
  value       = aws_lb.main.load_balancer_type
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.main.arn
}

output "target_group_id" {
  description = "ID of the target group"
  value       = aws_lb_target_group.main.id
}

output "target_group_name" {
  description = "Name of the target group"
  value       = aws_lb_target_group.main.name
}

output "target_group_arn_suffix" {
  description = "ARN suffix of the target group"
  value       = aws_lb_target_group.main.arn_suffix
}

output "target_group_port" {
  description = "Port of the target group"
  value       = aws_lb_target_group.main.port
}

output "target_group_protocol" {
  description = "Protocol of the target group"
  value       = aws_lb_target_group.main.protocol
}

output "target_group_health_check" {
  description = "Health check configuration of the target group"
  value       = aws_lb_target_group.main.health_check
}

output "target_group_stickiness" {
  description = "Stickiness configuration of the target group"
  value       = aws_lb_target_group.main.stickiness[0]
}

output "listener_http_arn" {
  description = "ARN of the HTTP listener"
  value       = aws_lb_listener.http.arn
}

output "listener_https_arn" {
  description = "ARN of the HTTPS listener"
  value       = aws_lb_listener.https.arn
}

output "security_group_id" {
  description = "Security group ID of the ALB"
  value       = aws_security_group.alb.id
}

output "security_group_arn" {
  description = "Security group ARN of the ALB"
  value       = aws_security_group.alb.arn
}

output "dns_record_name" {
  description = "DNS record name"
  value       = var.zone_id != "" ? aws_route53_record.main[0].name : ""
}

output "dns_record_fqdn" {
  description = "DNS record fully qualified domain name"
  value       = var.zone_id != "" ? aws_route53_record.main[0].fqdn : ""
}

output "access_logs_bucket" {
  description = "S3 bucket for ALB access logs"
  value       = var.create_access_logs_bucket ? aws_s3_bucket.alb_logs[0].id : var.access_logs_bucket
}

output "waf_association_id" {
  description = "WAF association ID"
  value       = var.waf_web_acl_arn != "" ? aws_wafv2_web_acl_association.main[0].id : ""
}

output "cloudwatch_alarm_arns" {
  description = "List of CloudWatch alarm ARNs"
  value = [
    aws_cloudwatch_metric_alarm.target_response_time.arn,
    aws_cloudwatch_metric_alarm.http_code_5xx.arn,
    aws_cloudwatch_metric_alarm.http_code_4xx.arn,
    aws_cloudwatch_metric_alarm.target_connection_error_count.arn,
    aws_cloudwatch_metric_alarm.rejected_connection_count.arn
  ]
}

output "alb_endpoint_url" {
  description = "ALB endpoint URL"
  value       = var.zone_id != "" ? "https://${var.domain_name}" : "https://${aws_lb.main.dns_name}"
}