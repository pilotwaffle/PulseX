# PulseX Daily Briefing App - Database Architecture

A comprehensive PostgreSQL database architecture optimized for 10,000+ concurrent users with sub-50ms query response times.

## 🚀 Quick Start

### Prerequisites
- PostgreSQL 15+ (recommended)
- PgBouncer for connection pooling
- Redis for application caching
- At least 32GB RAM for production

### Setup Commands

```bash
# 1. Initialize database
psql -U postgres -f setup_database.sql

# 2. Apply connection configuration
psql -U postgres -d pulsex -f connection_config.sql

# 3. Load development data
psql -U postgres -d pulsex -f seed_data.sql

# 4. Setup GDPR compliance functions
psql -U postgres -d pulsex -f gdpr_compliance.sql
```

## 📁 Database Files Overview

### Core Schema
- **`schema.sql`** - Complete database schema with all tables, indexes, and constraints
- **`migrations/001_initial_schema.sql`** - Initial database structure
- **`migrations/002_add_indexes.sql`** - Performance optimization indexes and partitions

### Configuration & Setup
- **`setup_database.sql`** - One-click database initialization script
- **`connection_config.sql`** - User roles, permissions, and connection pooling
- **`seed_data.sql`** - Development and testing data

### Performance & Compliance
- **`performance_recommendations.md`** - Comprehensive optimization guide
- **`gdpr_compliance.sql`** - Data export, deletion, and anonymization functions

## 🏗️ Database Architecture

### Core Tables

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `users` | User authentication & preferences | JSONB preferences, GDPR soft delete |
| `briefings` | Daily personalized content | Partitioned by date, JSONB cards |
| `user_feedback` | Engagement tracking | Weighted feedback, personalization |
| `saved_cards` | Bookmarked content | Tag-based organization |
| `notification_tokens` | Push notifications | Multi-platform support |
| `sessions` | User session management | Device fingerprinting |
| `audit_logs` | GDPR compliance | Complete activity tracking |
| `analytics_events` | Performance metrics | High-speed event storage |

### Performance Optimizations

- **Partitioning**: Time-based partitions for briefings and audit logs
- **Indexing**: Strategic indexes for <50ms query times
- **Connection Pooling**: PgBouncer configuration for 10K+ users
- **JSONB Queries**: GIN indexes for flexible content filtering
- **Materialized Views**: Pre-computed analytics for reporting

## 🔧 Configuration

### Connection Pooling (PgBouncer)

```ini
[databases]
pulsex = host=localhost port=5432 dbname=pulsex

[pgbouncer]
pool_mode = transaction
max_client_conn = 20000
default_pool_size = 100
reserve_pool_size = 50
```

### Application Settings

```javascript
const pool = new Pool({
  host: 'localhost',
  port: 6432,
  database: 'pulsex',
  max: 50,
  min: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 5000
});
```

## 👥 User Roles & Permissions

| Role | Purpose | Permissions |
|------|---------|-------------|
| `pulsex_app` | Application access | CRUD operations on user data |
| `pulsex_analytics` | Reporting | Read-only access to all tables |
| `pulsex_migrations` | Schema management | Full database administration |
| `pulsex_backup` | Database backups | Read-only data export |
| `pulsex_readonly` | Monitoring | Read-only system monitoring |

## 🛡️ Security Features

### Row Level Security (RLS)
- Users can only access their own data
- Admin override capabilities
- Session-based context setting

### GDPR Compliance
- **Data Export**: Complete user data in JSON format
- **Right to Erasure**: Soft delete with data integrity
- **Data Anonymization**: Preserve analytics while removing PII
- **Audit Logging**: Complete data access tracking

### Example GDPR Functions

```sql
-- Export all user data
SELECT export_user_data('user@example.com');

-- Soft delete user account
SELECT soft_delete_user('user@example.com');

-- Generate compliance report
SELECT * FROM generate_user_data_inventory();
```

## 📊 Performance Monitoring

### Key Metrics

```sql
-- Database health dashboard
SELECT * FROM database_health;

-- Performance metrics
SELECT * FROM performance_metrics;

-- User activity summary
SELECT * FROM user_activity_summary;
```

### Alert Thresholds

- Query response time >100ms
- Database connections >80% capacity
- Cache hit rate <95%
- Replication lag >10 seconds

## 🔄 Migration Process

### Running Migrations

```bash
# Apply new migration
psql -U postgres -d pulsex -f migrations/003_new_feature.sql

# Verify migration
SELECT * FROM schema_migrations ORDER BY applied_at DESC;
```

### Rollback Strategy

```bash
# Rollback migration (if available)
psql -U postgres -d pullex -f migrations/rollback/002_rollback.sql
```

## 🎯 Performance Benchmarks

### Target Performance
- **Query Response**: <50ms average, <100ms 95th percentile
- **Concurrent Users**: 10,000 simultaneous
- **Briefing Generation**: <2 seconds
- **Content Loading**: <200ms

### Load Testing Scenarios

```sql
-- Morning rush simulation (6-9 AM)
-- 5,000 briefings/hour
-- 1,000 feedback events/minute
-- Peak: 60% daily traffic
```

## 🛠️ Maintenance Procedures

### Daily Tasks
```sql
-- Cleanup old sessions
SELECT cleanup_expired_sessions();

-- Refresh materialized views
SELECT refresh_user_stats();

-- Monitor performance
SELECT * FROM monitor_connection_usage();
```

### Weekly Tasks
```sql
-- Analyze table statistics
ANALYZE VERBOSE;

-- Rebuild fragmented indexes
REINDEX DATABASE pulsex;

-- Update table statistics
VACUUM ANALYZE;
```

### Monthly Tasks
```sql
-- Create new partitions
SELECT create_monthly_partitions('briefings', 3);

-- GDPR compliance cleanup
SELECT schedule_gdpr_cleanup();

-- Performance review
SELECT * FROM get_long_running_queries();
```

## 🚨 Emergency Procedures

### Query Timeouts
```sql
SET statement_timeout = '5s';
SET lock_timeout = '2s';
```

### Connection Throttling
```sql
ALTER ROLE pulsex_app CONNECTION LIMIT 50;
```

### Cache Warmup
```sql
-- Pre-warm critical caches before morning rush
SELECT * FROM users WHERE status = 'active';
SELECT * FROM briefings WHERE briefing_date = CURRENT_DATE;
```

## 📈 Scaling Recommendations

### Horizontal Scaling
- **Read Replicas**: 2-3 for analytical queries
- **Database Sharding**: User-based beyond 100K users
- **Geographic Distribution**: Multi-region for global users

### Vertical Scaling
- **Memory**: 32GB minimum, 64GB recommended
- **CPU**: 8+ cores, 16+ for production
- **Storage**: NVMe SSD with >10,000 IOPS

## 🔍 Troubleshooting

### Common Issues

1. **Slow Queries**
   ```sql
   -- Check slow queries
   SELECT query, mean_time, calls
   FROM pg_stat_statements
   ORDER BY mean_time DESC LIMIT 10;
   ```

2. **Connection Issues**
   ```sql
   -- Monitor connections
   SELECT * FROM monitor_connection_usage();
   ```

3. **High Memory Usage**
   ```sql
   -- Check memory-intensive queries
   SELECT query, shared_blks_hit, shared_blks_read
   FROM pg_stat_statements
   ORDER BY shared_blks_read DESC;
   ```

## 📞 Support

For database-related issues:
1. Check performance monitoring views
2. Review PostgreSQL error logs
3. Verify PgBouncer configuration
4. Test with direct database connection

## 📄 Documentation

- **Performance Guide**: `performance_recommendations.md`
- **GDPR Compliance**: `gdpr_compliance.sql`
- **Schema Documentation**: `schema.sql`
- **Setup Instructions**: `setup_database.sql`

---

**Database Version**: 1.0.0
**Last Updated**: 2024-12-08
**Compatible With**: PostgreSQL 15+