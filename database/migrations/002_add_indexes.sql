-- Migration 002: Add Performance Indexes and Partitions
-- Optimizes database for 10K+ concurrent users with <50ms query performance
-- Version: 1.0.0
-- Date: 2024-12-08

-- Additional indexes for performance optimization

-- Users table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_status ON users(status) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_active ON users(last_active_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_preferences_gin ON users USING GIN(preferences);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_interests_gin ON users USING GIN(interests);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_unique_active ON users(email) WHERE deleted_at IS NULL;

-- Briefings table performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_date_status ON briefings(briefing_date DESC, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_published_at ON briefings(published_at DESC) WHERE status = 'published';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_cards_gin ON briefings USING GIN(cards);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_metadata_gin ON briefings USING GIN(metadata);

-- Partial index for unread briefings
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_unread ON briefings(user_id, briefing_date)
WHERE status = 'published' AND view_count = 0;

-- User feedback indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_feedback_topic_weight ON user_feedback(topic, weight);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_feedback_briefing_card ON user_feedback(briefing_id, card_id);

-- Saved cards indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_cards_category ON saved_cards(user_id, category) WHERE category IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_cards_tags_gin ON saved_cards USING GIN(tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_cards_accessed ON saved_cards(last_accessed_at DESC);

-- Notification tokens indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_tokens_platform ON notification_tokens(platform, is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_tokens_last_used ON notification_tokens(last_used_at DESC);

-- Audit logs indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

-- Sessions indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Analytics events indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_user_created ON analytics_events(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_properties_gin ON analytics_events USING GIN(properties);

-- Create table partitions for time-series data (briefings)
-- Note: This requires PostgreSQL 10+ and careful planning for production
DO $$
DECLARE
    current_month DATE := date_trunc('month', CURRENT_DATE);
    i INTEGER;
BEGIN
    -- Create partitions for the next 12 months
    FOR i IN 0..11 LOOP
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS briefings_y%sm%s PARTITION OF briefings
            FOR VALUES FROM (%L) TO (%L)',
            EXTRACT(year FROM current_month),
            LPAD(EXTRACT(month FROM current_month)::TEXT, 2, '0'),
            current_month,
            current_month + INTERVAL '1 month'
        );

        EXECUTE format('
            CREATE TABLE IF NOT EXISTS audit_logs_y%sm%s PARTITION OF audit_logs
            FOR VALUES FROM (%L) TO (%L)',
            EXTRACT(year FROM current_month),
            LPAD(EXTRACT(month FROM current_month)::TEXT, 2, '0'),
            current_month,
            current_month + INTERVAL '1 month'
        );

        current_month := current_month + INTERVAL '1 month';
    END LOOP;
END $$;

-- JSONB path expression indexes for specific queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_card_types ON briefings USING GIN((cards->>'type'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_preferences_timezone ON users USING GIN((preferences->>'timezone'));

-- Partial indexes for active users
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_recent ON users(id, last_active_at DESC)
WHERE status = 'active' AND deleted_at IS NULL;

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_user_status_date ON briefings(user_id, status, briefing_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_user_type_topic ON user_feedback(user_id, feedback_type, topic);

-- Create functional indexes for case-insensitive searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower ON users(LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_lower ON users(LOWER(username)) WHERE deleted_at IS NULL;

-- Create BRIN indexes for large tables with natural ordering (if using PostgreSQL 9.5+)
-- These are particularly effective for time-series data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_briefings_date_brin ON briefings USING BRIN(briefing_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_brin ON audit_logs USING BRIN(created_at);

-- VIEWS FOR ANALYTICS AND REPORTING

-- Active users view
CREATE OR REPLACE VIEW active_users AS
SELECT
    u.id,
    u.email,
    u.username,
    u.last_active_at,
    u.preferences,
    CASE
        WHEN u.last_active_at > NOW() - INTERVAL '24 hours' THEN 'daily'
        WHEN u.last_active_at > NOW() - INTERVAL '7 days' THEN 'weekly'
        WHEN u.last_active_at > NOW() - INTERVAL '30 days' THEN 'monthly'
        ELSE 'inactive'
    END as activity_level
FROM users u
WHERE u.deleted_at IS NULL
AND u.status = 'active';

-- User engagement metrics view
CREATE OR REPLACE VIEW user_engagement_metrics AS
SELECT
    u.id as user_id,
    COUNT(DISTINCT b.id) as briefings_read,
    COUNT(DISTINCT DATE(b.briefing_date)) as active_days,
    AVG(b.read_time_seconds) as avg_read_time,
    AVG(b.completion_rate) as avg_completion_rate,
    COUNT(DISTINCT sc.id) as saved_cards,
    COUNT(DISTINCT uf.id) as feedback_given,
    MAX(b.published_at) as last_briefing_date
FROM users u
LEFT JOIN briefings b ON u.id = b.user_id AND b.status = 'published'
LEFT JOIN saved_cards sc ON u.id = sc.user_id
LEFT JOIN user_feedback uf ON u.id = uf.user_id
WHERE u.deleted_at IS NULL
GROUP BY u.id;

-- Briefing performance view
CREATE OR REPLACE VIEW briefing_performance AS
SELECT
    DATE(b.briefing_date) as briefing_date,
    COUNT(*) as total_briefings,
    COUNT(*) FILTER (WHERE b.view_count > 0) as viewed_briefings,
    AVG(b.view_count) as avg_views,
    AVG(b.read_time_seconds) as avg_read_time,
    AVG(b.completion_rate) as avg_completion_rate,
    COUNT(DISTINCT b.user_id) as unique_users
FROM briefings b
WHERE b.status = 'published'
GROUP BY DATE(b.briefing_date)
ORDER BY briefing_date DESC;

-- Content popularity view
CREATE OR REPLACE VIEW content_popularity AS
SELECT
    (cards->>'type') as content_type,
    (cards->>'category') as category,
    COUNT(*) as usage_count,
    AVG((uf.weight)) as avg_feedback_weight,
    COUNT(DISTINCT uf.user_id) as unique_interactions
FROM briefings b
CROSS JOIN jsonb_array_elements(b.cards) as cards
LEFT JOIN user_feedback uf ON uf.card_id = (cards->>'id')
WHERE b.status = 'published'
GROUP BY (cards->>'type'), (cards->>'category')
HAVING COUNT(*) > 10
ORDER BY usage_count DESC;

-- UTILITY FUNCTIONS FOR MAINTENANCE

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions
    WHERE expires_at < NOW() OR (is_active = FALSE AND last_activity_at < NOW() - INTERVAL '7 days');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update user last activity
CREATE OR REPLACE FUNCTION update_user_last_activity(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET last_active_at = NOW()
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to get user preferences efficiently
CREATE OR REPLACE FUNCTION get_user_preferences(user_uuid UUID)
RETURNS JSONB AS $$
BEGIN
    RETURN COALESCE(
        (SELECT preferences FROM users WHERE id = user_uuid AND deleted_at IS NULL),
        '{}'
    );
END;
$$ LANGUAGE plpgsql;

-- Constraint additions for data integrity
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS check_last_login_created
CHECK (last_login_at IS NULL OR last_login_at >= created_at);

ALTER TABLE briefings ADD CONSTRAINT IF NOT EXISTS check_published_order
CHECK (published_at IS NULL OR published_at >= created_at);

-- Additional foreign key constraint
ALTER TABLE user_feedback
ADD CONSTRAINT IF NOT EXISTS fk_user_feedback_briefing
FOREIGN KEY (briefing_id) REFERENCES briefings(id) ON DELETE SET NULL;

-- Insert migration record
INSERT INTO schema_migrations (version, applied_at) VALUES ('002_add_indexes', NOW()) ON CONFLICT DO NOTHING;