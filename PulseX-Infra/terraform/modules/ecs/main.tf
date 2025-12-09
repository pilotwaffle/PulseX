# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-cluster"
    Environment = var.environment
  }
}

# Task Execution Role
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.name_prefix}-${var.environment}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-ecs-execution-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.name_prefix}-${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-ecs-task-role"
    Environment = var.environment
  }
}

# CloudWatch Logs
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.name_prefix}-${var.environment}"
  retention_in_days = 30

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-logs"
    Environment = var.environment
  }
}

# Task Definition
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.name_prefix}-${var.environment}-app"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "${var.name_prefix}-app"
      image = var.container_image

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "AWS_REGION"
          value = "us-east-1"
        },
        {
          name  = "S3_BUCKET"
          value = var.s3_bucket
        }
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = var.database_url
        },
        {
          name      = "REDIS_URL"
          valueFrom = var.redis_url
        },
        {
          name      = "JWT_SECRET"
          valueFrom = var.jwt_secret
        },
        {
          name      = "AWS_ACCESS_KEY_ID"
          valueFrom = var.aws_access_key
        },
        {
          name      = "AWS_SECRET_ACCESS_KEY"
          valueFrom = var.aws_secret_key
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = "us-east-1"
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      ulimits = [
        {
          name      = "nofile"
          softLimit = 65536
          hardLimit = 65536
        }
      ]

      linuxParameters = {
        initProcessEnabled = true
      }

      # Security
      readonlyRootFilesystem = false
      tmpfs = [
        {
          containerPath = "/tmp"
          size         = 100
        }
      ]
    }
  ])

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-task-definition"
    Environment = var.environment
  }
}

# ECS Service
resource "aws_ecs_service" "app" {
  name            = "${var.name_prefix}-${var.environment}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "${var.name_prefix}-app"
    container_port   = var.container_port
  }

  deployment_controller {
    type = "ECS"
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Deployment configuration for zero-downtime
  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  # Service discovery
  service_registries {
    registry_arn = aws_service_discovery_service.app.arn
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-service"
    Environment = var.environment
  }

  depends_on = [aws_iam_role_policy_attachment.ecs_execution_role_policy]
}

# Auto Scaling Target
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale Up Policy
resource "aws_appautoscaling_policy" "ecs_scale_up" {
  name               = "${var.name_prefix}-${var.environment}-scale-up"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale Down Policy
resource "aws_appautoscaling_policy" "ecs_scale_down" {
  name               = "${var.name_prefix}-${var.environment}-scale-down"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 30.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Security Group
resource "aws_security_group" "ecs_service" {
  name        = "${var.name_prefix}-${var.environment}-ecs-sg"
  description = "Security group for ECS service"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-ecs-sg"
    Environment = var.environment
  }
}

# Service Discovery
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.name_prefix}-${var.environment}.local"
  description = "Service discovery namespace for ${var.name_prefix} ${var.environment}"
  vpc         = var.vpc_id

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-sd-namespace"
    Environment = var.environment
  }
}

resource "aws_service_discovery_service" "app" {
  name = "${var.name_prefix}-app"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Name        = "${var.name_prefix}-${var.environment}-sd-service"
    Environment = var.environment
  }
}