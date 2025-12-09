# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "main" {
  name              = "/aws/pulsex/${var.environment}"
  retention_in_days = 30

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-logs"
    Environment = var.environment
  }
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-${var.environment}-alerts"

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alerts"
    Environment = var.environment
  }
}

# SNS Topic Subscription (Email)
resource "aws_sns_topic_subscription" "email" {
  count     = length(var.email_alerts)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.email_alerts[count.index]
}

# SNS Topic Subscription (Slack)
resource "aws_sns_topic_subscription" "slack" {
  count     = var.slack_webhook_url != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "https"
  endpoint  = var.slack_webhook_url
}

# ALB Metrics
resource "aws_cloudwatch_metric_alarm" "alb_5xx_error_rate" {
  alarm_name          = "${var.name_prefix}-${var.environment}-alb-5xx-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "50"
  alarm_description   = "This metric monitors the number of 5XX errors from the Application Load Balancer"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = var.alb_arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-5xx-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_latency" {
  alarm_name          = "${var.name_prefix}-${var.environment}-alb-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "5"
  alarm_description   = "This metric monitors the latency of the Application Load Balancer"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = var.alb_arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-alb-latency-alarm"
    Environment = var.environment
  }
}

# ECS Metrics
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ServiceName = var.ecs_cluster_arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-ecs-cpu-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-ecs-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "85"
  alarm_description   = "This metric monitors ECS memory utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ServiceName = var.ecs_cluster_arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-ecs-memory-alarm"
    Environment = var.environment
  }
}

# RDS Metrics
resource "aws_cloudwatch_metric_alarm" "rds_cpu_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-cpu-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors RDS database connections"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-connections-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${var.name_prefix}-${var.environment}-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "20000000000" # 20GB in bytes
  alarm_description   = "This metric monitors RDS free storage space"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-rds-storage-alarm"
    Environment = var.environment
  }
}

# ElastiCache Metrics
resource "aws_cloudwatch_metric_alarm" "redis_cpu_utilization" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-cpu-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.name_prefix}-${var.environment}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "BytesUsedForCache"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "1342177280" # 1.25GB in bytes
  alarm_description   = "This metric monitors Redis memory usage"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-redis-memory-alarm"
    Environment = var.environment
  }
}

# Custom Application Metrics Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-${var.environment}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn],
            [".", "HTTPCode_ELB_5XX_Count", ".", var.alb_arn]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "ALB Performance"
          yAxis   = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", var.ecs_cluster_arn],
            [".", "MemoryUtilization", ".", var.ecs_cluster_arn]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "ECS Resource Utilization"
          yAxis   = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.rds_instance_arn],
            [".", "DatabaseConnections", ".", var.rds_instance_arn],
            [".", "FreeStorageSpace", ".", var.rds_instance_arn]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "RDS Performance"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", var.redis_cluster_id],
            [".", "BytesUsedForCache", ".", var.redis_cluster_id]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "Redis Performance"
        }
      }
    ]
  })
}

# CloudWatch Insights for Log Analysis
resource "aws_cloudwatch_query_definition" "app_errors" {
  name = "${var.name_prefix}-${var.environment}-app-errors"

  log_group_names = [aws_cloudwatch_log_group.main.name]

  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /ERROR/
    | sort @timestamp desc
    | limit 100
  EOT
}

resource "aws_cloudwatch_query_definition" "slow_requests" {
  name = "${var.name_prefix}-${var.environment}-slow-requests"

  log_group_names = [aws_cloudwatch_log_group.main.name]

  query_string = <<-EOT
    fields @timestamp, @message
    | parse @message "duration=*ms" as duration
    | filter duration > 1000
    | sort @timestamp desc
    | limit 50
  EOT
}