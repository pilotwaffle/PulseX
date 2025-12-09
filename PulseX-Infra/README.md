# PulseX Daily Briefing App - Infrastructure & Deployment

## 📋 Overview

This repository contains the complete infrastructure setup, CI/CD pipelines, and deployment automation for the PulseX Daily Briefing App. It's designed to support a scalable, secure, and highly available mobile application serving 10,000+ concurrent users across multiple environments.

## 🏗️ Architecture

### Infrastructure Components

- **Container Orchestration**: AWS ECS with Fargate
- **Database**: PostgreSQL with read replicas
- **Caching**: ElastiCache Redis cluster
- **Storage**: Amazon S3 with lifecycle policies
- **CDN**: Amazon CloudFront with global distribution
- **Load Balancing**: Application Load Balancer with SSL termination
- **Security**: AWS WAF, VPC, Security Groups, Secrets Manager
- **Monitoring**: CloudWatch, custom dashboards, alerting
- **CI/CD**: GitHub Actions with automated testing and deployment

### Environments

- **Development**: Single-task deployment, minimal resources
- **Staging**: Multi-task deployment, production-like configuration
- **Production**: High-availability, auto-scaling, disaster recovery

## 🚀 Quick Start

### Prerequisites

- AWS CLI configured with appropriate permissions
- Docker installed
- Terraform v1.0+
- Node.js 18+
- Git

### 1. Clone Repository

```bash
git clone https://github.com/your-org/PulseX-Infra.git
cd PulseX-Infra
```

### 2. Deploy to Development

```bash
# Deploy complete infrastructure
./scripts/deploy.sh development

# Or deploy specific components
cd terraform
terraform workspace new development
terraform init
terraform apply -var-file="environments/development.tfvars"
```

### 3. Verify Deployment

```bash
# Get application URL
cd terraform && terraform output app_url

# Check health
curl "$(terraform output -raw alb_url)/health"
```

## 📁 Directory Structure

```
PulseX-Infra/
├── docker/                          # Docker configuration
│   ├── Dockerfile                   # Multi-stage production build
│   ├── docker-compose.yml           # Development environment
│   ├── docker-compose.prod.yml      # Production environment
│   ├── nginx.conf                   # Reverse proxy configuration
│   └── .dockerignore                # Docker ignore patterns
├── github-actions/                  # CI/CD workflows
│   ├── ci.yml                       # Main CI/CD pipeline
│   ├── database-migration.yml       # Database migration workflow
│   └── mobile-app-release.yml       # Mobile app release automation
├── terraform/                       # Infrastructure as Code
│   ├── main.tf                      # Main configuration
│   ├── variables.tf                 # Input variables
│   ├── outputs.tf                   # Output values
│   ├── modules/                     # Reusable modules
│   │   ├── vpc/                     # VPC and networking
│   │   ├── ecs/                     # ECS cluster and services
│   │   ├── rds/                     # PostgreSQL database
│   │   ├── redis/                   # ElastiCache Redis
│   │   ├── alb/                     # Application Load Balancer
│   │   ├── s3/                      # S3 buckets
│   │   ├── cloudfront/              # CDN configuration
│   │   ├── monitoring/              # CloudWatch and alerting
│   │   └── security/                # Security policies
│   └── environments/                # Environment-specific configs
│       ├── development.tfvars
│       ├── staging.tfvars
│       └── production.tfvars
├── scripts/                         # Automation scripts
│   ├── deploy.sh                    # Main deployment script
│   ├── backup-restore.sh            # Backup and recovery
│   ├── security-scan.sh             # Security scanning
│   └── performance-test.sh          # Load testing
├── security/                        # Security configurations
│   ├── security-policies.json       # Comprehensive security policies
│   ├── waf-rules.json              # WAF rule definitions
│   └── compliance-checks.sh         # Compliance validation
├── docs/                           # Documentation
│   ├── deployment-guide.md         # Detailed deployment instructions
│   ├── security-guide.md           # Security best practices
│   ├── monitoring-guide.md         # Monitoring and alerting
│   └── troubleshooting.md          # Common issues and solutions
└── README.md                       # This file
```

## 🔧 Configuration

### Environment Variables

Copy and configure the appropriate environment file:

```bash
cp .env.example .env.development
cp .env.example .env.staging
cp .env.example .env.production

# Edit each file with appropriate values
```

### Terraform Variables

Each environment has its own variable file:

```bash
# terraform/environments/development.tfvars
environment         = "development"
app_desired_count   = 1
db_instance_class   = "db.t4g.medium"
redis_nodes         = 1
```

## 🚀 Deployment

### Automated Deployment

Use the provided deployment script for end-to-end deployment:

```bash
# Deploy to specific environment
./scripts/deploy.sh <environment> [region]

# Examples
./scripts/deploy.sh development
./scripts/deploy.sh staging us-east-1
./scripts/deploy.sh production us-east-1

# Rollback deployment
./scripts/deploy.sh rollback production
```

### Manual Deployment

For manual control over the deployment process:

#### 1. Infrastructure Deployment

```bash
cd terraform

# Select environment
terraform workspace select development

# Plan and apply
terraform plan -var-file="environments/development.tfvars"
terraform apply -var-file="environments/development.tfvars"
```

#### 2. Application Deployment

```bash
# Build and push Docker image
docker build -t pulsex:latest .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com
docker tag pulsex:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/pulsex:latest
docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/pulsex:latest

# Update ECS service
aws ecs update-service --cluster pulsex-development-cluster --service pulsex-development-service --force-new-deployment
```

## 📊 Monitoring

### Key Metrics

- **Application Performance**: Response times, error rates, throughput
- **Infrastructure Health**: CPU, memory, disk usage
- **Database Performance**: Query times, connection counts, replication lag
- **Cache Performance**: Hit ratio, eviction rates, memory usage

### Accessing Dashboards

```bash
# CloudWatch Console
aws cloudwatch get-dashboard --dashboard-name pulsex-development-dashboard

# Main dashboard URL: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=pulsex-development-dashboard
```

### Alert Configuration

Alerts are configured via the monitoring module and send notifications to:

- Slack channels (#alerts, #deployments)
- Email addresses (configured per environment)
- PagerDuty (for production critical alerts)

## 🔐 Security

### Security Features

- **Network Security**: VPC with private subnets, security groups, WAF
- **Data Protection**: Encryption at rest and in transit, secrets management
- **Access Control**: IAM roles, least privilege principle
- **Vulnerability Management**: Automated scanning in CI/CD pipeline
- **Compliance**: SOC 2, HIPAA, GDPR compliance ready

### Security Checks

```bash
# Run security scan
./scripts/security-scan.sh

# Check compliance
./scripts/compliance-checks.sh

# Review security policies
cat security/security-policies.json
```

## 💾 Backup and Recovery

### Automated Backups

- **Database**: Daily snapshots with 30-day retention
- **Redis**: Daily snapshots with 15-day retention
- **Files**: S3 versioning with lifecycle policies

### Manual Operations

```bash
# Create database backup
./scripts/backup-restore.sh production database backup

# Restore from backup
./scripts/backup-restore.sh production database restore database/pulsex_prod_db_20231208_120000.sql.gz

# List available backups
./scripts/backup-restore.sh production list

# Cleanup old backups
./scripts/backup-restore.sh production cleanup 30
```

## 🧪 Testing

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Performance tests
./scripts/performance-test.sh

# Load tests
npm run test:load
```

### CI/CD Pipeline

The GitHub Actions workflow includes:

1. **Code Quality**: Linting, type checking
2. **Security Scanning**: Dependency vulnerability scan
3. **Automated Testing**: Unit, integration, e2e tests
4. **Build Optimization**: Docker image optimization
5. **Environment Deployment**: Automated deployment to staging/production

## 🔧 Troubleshooting

### Common Issues

1. **Deployment Failures**
   ```bash
   # Check ECS logs
   aws logs tail /ecs/pulsex-production --follow

   # Check recent deployments
   aws ecs describe-services --cluster pulsex-production-cluster --services pulsex-production-service
   ```

2. **Database Connection Issues**
   ```bash
   # Test connectivity
   psql -h $DB_ENDPOINT -U $DB_USER -d $DB_NAME

   # Check security groups
   aws ec2 describe-security-groups --group-ids $SECURITY_GROUP_ID
   ```

3. **Performance Issues**
   ```bash
   # Check CloudWatch metrics
   aws cloudwatch get-metric-statistics \
     --namespace AWS/ApplicationELB \
     --metric-name TargetResponseTime \
     --dimensions Name=LoadBalancer,Value=$ALB_ARN \
     --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
     --period 60 \
     --statistics Average
   ```

### Getting Help

- **Documentation**: Check `docs/` directory for detailed guides
- **Slack**: #devops-support channel
- **Email**: devops@company.com

## 📱 Mobile App Deployment

### iOS App Store

```bash
# Trigger automated release
git tag v1.0.0
git push origin v1.0.0

# Or manually
cd mobile/ios
xcodebuild -workspace PulseX.xcworkspace -scheme PulseX -configuration Release archive
```

### Android Google Play

```bash
# Automated release via GitHub Actions
git tag v1.0.0
git push origin v1.0.0

# Or manual build
cd mobile/android
./gradlew assembleRelease
./gradlew bundleRelease
```

## 📈 Scaling

### Auto Scaling Configuration

- **CPU Thresholds**: Scale up at 70%, scale down at 30%
- **Memory Thresholds**: Scale up at 85%, scale down at 50%
- **Request Rate**: Scale based on ALB request count
- **Custom Metrics**: Application-specific metrics

### Scaling Events

```bash
# Monitor scaling activities
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/pulsex-production-cluster/pulsex-production-service \
  --scalable-dimension ecs:service:DesiredCount
```

## 💰 Cost Optimization

### Cost Monitoring

```bash
# Check monthly costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -d 'first day of last month' +%Y-%m-%d),End=$(date -d 'last day of last month' +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

### Optimization Strategies

- **Reserved Instances**: Use for predictable workloads
- **Spot Instances**: For non-critical workloads
- **Storage Classes**: Use S3 Intelligent-Tiering
- **Data Transfer**: Use CloudFront for static assets

## 🔄 Updates and Maintenance

### Regular Maintenance Tasks

1. **Weekly**
   - Review CloudWatch metrics
   - Check for security updates
   - Validate backup procedures

2. **Monthly**
   - Update dependencies
   - Review and rotate secrets
   - Performance tuning

3. **Quarterly**
   - Security audit
   - Cost analysis and optimization
   - Disaster recovery testing

### Update Procedures

```bash
# Update infrastructure
cd terraform
terraform init -upgrade
terraform plan -var-file="environments/production.tfvars"
terraform apply -var-file="environments/production.tfvars"

# Update application
./scripts/deploy.sh production
```

## 📚 Additional Documentation

- [Deployment Guide](docs/deployment-guide.md) - Comprehensive deployment instructions
- [Security Guide](docs/security-guide.md) - Security best practices and policies
- [Monitoring Guide](docs/monitoring-guide.md) - Monitoring and alerting setup
- [Troubleshooting Guide](docs/troubleshooting.md) - Common issues and solutions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request with a detailed description

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For questions, issues, or support requests:

- **Email**: devops@company.com
- **Slack**: #pulsex-infra
- **Issues**: [GitHub Issues](https://github.com/your-org/PulseX-Infra/issues)

---

**Last Updated**: December 8, 2023
**Version**: 1.0.0
**Maintainer**: DevOps Team