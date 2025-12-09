# PulseX Daily Briefing App - Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the PulseX Daily Briefing App across different environments (development, staging, production) using the established infrastructure and CI/CD pipeline.

## Architecture Overview

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Users/Mobile  │────│  CloudFront CDN │────│  ALB (HTTPS)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                              ┌─────────────────┐
                                              │   ECS Cluster   │
                                              │ (Fargate Tasks) │
                                              └─────────────────┘
                                                       │
                       ┌─────────────────┬─────────────┼─────────────┬─────────────────┐
                       │                 │             │             │                 │
              ┌─────────────────┐ ┌─────────────────┐ │    ┌─────────────────┐ ┌─────────────────┐
              │  PostgreSQL RDS │ │  ElastiCache    │ │    │  S3 Buckets     │ │  CloudWatch     │
              │ (Primary +      │ │  Redis          │ │    │  (Assets +      │ │  Monitoring     │
              │  Read Replicas) │ │                 │ │    │   Backups)      │ │                 │
              └─────────────────┘ └─────────────────┘ │    └─────────────────┘ └─────────────────┘
                                               │
                                               │
                                      ┌─────────────────┐
                                      │  Security       │
                                      │  (WAF + Secrets │
                                      │   Manager)      │
                                      └─────────────────┘
```

## Prerequisites

### Required Tools

1. **AWS CLI** (v2.0+)
2. **Terraform** (v1.0+)
3. **Docker** (v20.0+)
4. **Git**
5. **kubectl** (optional, for Kubernetes operations)

### AWS Setup

1. **Configure AWS Credentials**
   ```bash
   aws configure
   # OR set environment variables:
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_DEFAULT_REGION=us-east-1
   ```

2. **Create ECR Repository**
   ```bash
   aws ecr create-repository --repository-name pulsex --region us-east-1
   ```

3. **Create S3 Buckets for State and Backups**
   ```bash
   aws s3 mb s3://pulsex-terraform-state
   aws s3 mb s3://pulsex-dev-backups
   aws s3 mb s3://pulsex-staging-backups
   aws s3 mb s3://pulsex-prod-backups
   ```

## Environment Configuration

### Environment Variables

Create `.env` files for each environment:

#### Development (.env.dev)
```bash
# Environment
NODE_ENV=development
AWS_REGION=us-east-1

# Database
DATABASE_URL=postgresql://user:pass@endpoint:5432/pulsex_dev

# Redis
REDIS_URL=redis://endpoint:6379

# AWS Services
S3_BUCKET=pulsex-dev-assets
CDN_DOMAIN=dev.pulsex.app

# Security
JWT_SECRET=your-dev-jwt-secret
SSL_CERTIFICATE_ARN=arn:aws:acm:us-east-1:account:certificate/dev

# Monitoring
SLACK_WEBHOOK_URL=https://hooks.slack.com/your-webhook
EMAIL_ALERTS=dev-team@company.com
```

#### Production (.env.prod)
```bash
# Environment
NODE_ENV=production
AWS_REGION=us-east-1

# Database
DATABASE_URL=postgresql://user:pass@endpoint:5432/pulsex_prod

# Redis
REDIS_URL=redis://endpoint:6379

# AWS Services
S3_BUCKET=pulsex-prod-assets
CDN_DOMAIN=pulsex.app

# Security
JWT_SECRET=your-production-jwt-secret
SSL_CERTIFICATE_ARN=arn:aws:acm:us-east-1:account:certificate/prod

# Monitoring
SLACK_WEBHOOK_URL=https://hooks.slack.com/your-webhook
EMAIL_ALERTS=ops-team@company.com,alerts@company.com
```

## Deployment Process

### 1. Initial Infrastructure Setup

First-time infrastructure deployment:

```bash
# Navigate to infrastructure directory
cd PulseX-Infra/terraform

# Initialize Terraform
terraform init

# Create development workspace
terraform workspace new development
terraform workspace select development

# Plan and apply infrastructure
terraform plan -var-file="environments/development.tfvars" -out="dev.tfplan"
terraform apply "dev.tfplan"

# Repeat for staging and production
terraform workspace new staging
terraform workspace select staging
terraform plan -var-file="environments/staging.tfvars" -out="staging.tfplan"
terraform apply "staging.tfplan"
```

### 2. Using the Deployment Script

The provided deployment script automates the entire process:

```bash
# Deploy to development
./scripts/deploy.sh development

# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production

# Rollback deployment
./scripts/deploy.sh rollback production
```

### 3. Manual Deployment Steps

#### Step 1: Build and Push Docker Image

```bash
# Get current commit hash
COMMIT_HASH=$(git rev-parse --short HEAD)

# Build Docker image
docker build -t pulsex:latest .

# Tag for ECR
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/pulsex"

docker tag pulsex:latest "${ECR_REPO}:${COMMIT_HASH}"
docker tag pulsex:latest "${ECR_REPO}:latest"

# Login to ECR and push
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO
docker push "${ECR_REPO}:${COMMIT_HASH}"
docker push "${ECR_REPO}:latest"
```

#### Step 2: Update Terraform Variables

```bash
cd terraform

# Update container image
terraform apply -var="container_image=${ECR_REPO}:${COMMIT_HASH}" -auto-approve
```

#### Step 3: Run Database Migrations

```bash
# Get database endpoint
DB_ENDPOINT=$(terraform output -raw rds_instance_endpoint)

# Run migrations
DATABASE_URL="postgresql://user:pass@${DB_ENDPOINT}:5432/pulsex" npm run migrate:up
```

#### Step 4: Verify Deployment

```bash
# Get load balancer URL
ALB_URL=$(terraform output -raw alb_url)

# Health check
curl -f "${ALB_URL}/health"

# Check application version
curl -f "${ALB_URL}/api/version"
```

## CI/CD Pipeline

### GitHub Actions Workflow

The repository includes automated workflows:

1. **CI Pipeline** (`ci.yml`)
   - Code quality checks (linting, type checking)
   - Unit and integration tests
   - Security scanning (Trivy, npm audit)
   - Docker image building and optimization
   - Environment-specific deployments

2. **Database Migration** (`database-migration.yml`)
   - Manual or scheduled database migrations
   - Rollback capabilities
   - Pre-migration backups

3. **Mobile App Release** (`mobile-app-release.yml`)
   - Automated iOS and Android builds
   - App Store deployment
   - Certificate management

### Workflow Triggers

- **Push to main branch**: Triggers staging deployment
- **Push to develop branch**: Triggers development deployment
- **Pull requests**: Triggers CI checks only
- **Tag creation**: Triggers production deployment

## Backup and Recovery

### Database Backups

```bash
# Create manual backup
./scripts/backup-restore.sh development database backup

# List available backups
./scripts/backup-restore.sh development list database

# Restore from backup
./scripts/backup-restore.sh production database restore database/pulsex_prod_db_20231208_120000.sql.gz
```

### Redis Backups

```bash
# Create Redis backup
./scripts/backup-restore.sh development redis backup

# Restore Redis from backup
./scripts/backup-restore.sh production redis restore redis/pulsex_prod_redis_20231208_120000.tar.gz
```

### Automatic Backups

- **RDS**: Daily backups with 30-day retention
- **Redis**: Daily snapshots with 15-day retention
- **Cross-region**: Replication to us-west-2

## Monitoring and Alerting

### CloudWatch Metrics

Key metrics to monitor:

1. **Application Load Balancer**
   - HTTP 5XX error rate
   - Target response time
   - Request count
   - Healthy host count

2. **ECS/Fargate**
   - CPU and memory utilization
   - Task count
   - Deployment status

3. **RDS**
   - CPU, memory, storage utilization
   - Database connections
   - Read/write IOPS

4. **ElastiCache**
   - CPU and memory usage
   - Evictions
   - Cache hit ratio

### Alert Thresholds

```bash
# High-priority alerts
ALB_5XX_ERROR_RATE > 1% for 5 minutes
DATABASE_CPU > 80% for 10 minutes
APPLICATION_MEMORY > 90% for 5 minutes

# Medium-priority alerts
ALB_LATENCY > 2 seconds for 10 minutes
DATABASE_CONNECTIONS > 80% of max
REDIS_MEMORY > 85% for 10 minutes
```

### Log Analysis

Use CloudWatch Logs Insights for troubleshooting:

```sql
# Find application errors
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

# Find slow requests
fields @timestamp, @message
| parse @message "duration=*ms" as duration
| filter duration > 1000
| sort @timestamp desc
| limit 50
```

## Security Considerations

### Network Security

- **VPC**: Private subnets for application and database
- **Security Groups**: Restrictive inbound/outbound rules
- **NAT Gateways**: For outbound internet access
- **WAF**: Web Application Firewall protection

### Application Security

- **SSL/TLS**: Enforced encryption in transit
- **Secrets Management**: AWS Secrets Manager
- **Container Security**: Non-root user, read-only filesystem
- **Vulnerability Scanning**: Automated in CI/CD pipeline

### Compliance

- **Data Encryption**: At rest and in transit
- **Audit Logging**: CloudTrail enabled
- **Access Control**: IAM roles and policies
- **Data Retention**: Configurable retention policies

## Troubleshooting

### Common Issues

1. **Deployment Fails**
   ```bash
   # Check ECS task logs
   aws logs tail /ecs/pulsex-prod --follow

   # Check recent deployments
   aws ecs describe-services --cluster pulsex-prod-cluster --services pulsex-prod-service
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connectivity
   psql -h $DB_ENDPOINT -U $DB_USER -d $DB_NAME

   # Check security groups
   aws ec2 describe-security-groups --group-ids $SG_ID
   ```

3. **High Memory Usage**
   ```bash
   # Check container resource limits
   aws ecs describe-task-definition --task-definition $TASK_DEF

   # Scale up resources if needed
   aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition $NEW_TASK_DEF
   ```

### Performance Tuning

1. **Database Optimization**
   - Enable query logging
   - Add read replicas
   - Optimize slow queries

2. **Caching Strategy**
   - Implement Redis caching
   - Set appropriate TTL values
   - Cache static assets

3. **Auto Scaling**
   - Adjust CPU/memory thresholds
   - Implement scaling policies
   - Monitor scaling events

## Rollback Procedures

### Emergency Rollback

```bash
# Quick rollback to previous deployment
./scripts/deploy.sh rollback production

# Manual rollback using Terraform
terraform apply -var="container_image=${PREVIOUS_IMAGE}" -target=aws_ecs_service.app
```

### Database Rollback

```bash
# Restore database from backup
./scripts/backup-restore.sh production database restore database/latest_backup.sql.gz

# Rollback migrations
npm run migrate:down -- --step=1
```

## Mobile App Deployment

### iOS App Store

1. **Prepare Build**
   ```bash
   # Navigate to React Native project
   cd mobile/ios

   # Install dependencies
   pod install

   # Build for App Store
   xcodebuild -workspace PulseX.xcworkspace \
     -scheme PulseX \
     -configuration Release \
     -destination generic/platform=iOS \
     -archivePath PulseX.xcarchive \
     archive
   ```

2. **Upload to App Store Connect**
   ```bash
   xcodebuild -exportArchive \
     -archivePath PulseX.xcarchive \
     -exportOptionsPlist ExportOptions.plist \
     -exportPath ./build
   ```

### Android Google Play

1. **Prepare Build**
   ```bash
   # Navigate to React Native project
   cd mobile/android

   # Build release APK
   ./gradlew assembleRelease

   # Build release bundle
   ./gradlew bundleRelease
   ```

2. **Upload to Google Play Console**
   ```bash
   # Use Google Play CLI
   google-play-cli upload --track production --apk app-release.aab
   ```

## Cost Optimization

### Resource Optimization

1. **Right-sizing Instances**
   - Monitor actual usage
   - Adjust instance sizes accordingly
   - Use burstable instances where appropriate

2. **Storage Optimization**
   - Implement S3 lifecycle policies
   - Use appropriate storage classes
   - Clean up old snapshots

3. **Network Optimization**
   - Use CloudFront for static assets
   - Implement data compression
   - Optimize data transfer

### Monitoring Costs

```bash
# Check cost and usage
aws ce get-cost-and-usage \
  --time-period Start=2023-12-01,End=2023-12-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# Set up cost alerts
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://cost-budget.json
```

## Support and Escalation

### Contact Information

- **DevOps Team**: devops@company.com
- **On-call Engineer**: +1-555-0123
- **Security Team**: security@company.com

### Emergency Procedures

1. **Service Outage**
   - Check CloudWatch alarms
   - Review recent deployments
   - Initiate rollback if necessary

2. **Security Incident**
   - Enable GuardDuty findings
   - Block malicious IPs
   - Review CloudTrail logs

3. **Data Loss**
   - Stop affected services
   - Restore from backups
   - Investigate root cause

## Appendices

### A. Environment-Specific Configurations

#### Development Environment
- **ECS Tasks**: 1 task (min=1, max=3)
- **Database**: db.t4g.medium
- **Redis**: cache.t3.micro (1 node)
- **Auto Scaling**: Conservative thresholds

#### Staging Environment
- **ECS Tasks**: 2 tasks (min=2, max=5)
- **Database**: db.r6g.large
- **Redis**: cache.t3.small (2 nodes)
- **Auto Scaling**: Moderate thresholds

#### Production Environment
- **ECS Tasks**: 3 tasks (min=3, max=20)
- **Database**: db.r6g.2xlarge (with read replicas)
- **Redis**: cache.r6g.large (3 nodes)
- **Auto Scaling**: Aggressive thresholds

### B. Security Checklists

#### Pre-deployment Security Checklist
- [ ] Security scan passed
- [ ] No vulnerable dependencies
- [ ] Secrets properly configured
- [ ] SSL certificates valid
- [ ] WAF rules enabled
- [ ] Backup procedures tested

#### Post-deployment Security Checklist
- [ ] Access logs reviewed
- [ ] Error rates within normal range
- [ ] Performance metrics acceptable
- [ ] Security monitoring enabled
- [ ] Alert notifications tested

### C. Performance Benchmarks

#### Target Performance Metrics
- **API Response Time**: < 200ms (95th percentile)
- **Database Query Time**: < 100ms (average)
- **Cache Hit Ratio**: > 90%
- **Error Rate**: < 0.1%
- **Uptime**: 99.9%

#### Load Testing Scenarios
- **Normal Load**: 1,000 concurrent users
- **Peak Load**: 5,000 concurrent users
- **Stress Test**: 10,000+ concurrent users

This deployment guide provides a comprehensive reference for deploying and managing the PulseX Daily Briefing App. For specific issues or questions, please contact the DevOps team.