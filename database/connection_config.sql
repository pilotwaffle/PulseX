-- PulseX Daily Briefing App - Database Connection Configuration
-- Provides optimized connection settings and roles for application access
-- Version: 1.0.0

-- ============================================================================
-- 1. ROLES AND PERMISSIONS
-- ============================================================================

-- Application user role (limited permissions)
CREATE ROLE pulsex_app WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    CONNECTION LIMIT 100
    PASSWORD 'CHANGE_ME_SECURE_PASSWORD';

-- Analytics user role (read-only access for reporting)
CREATE ROLE pulsex_analytics WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT 50
    PASSWORD 'CHANGE_ME_ANALYTICS_PASSWORD';

-- Migration user role (schema management)
CREATE ROLE pulsex_migrations WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    CONNECTION LIMIT 5
    PASSWORD 'CHANGE_ME_MIGRATIONS_PASSWORD';

-- Backup user role
CREATE ROLE pulsex_backup WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT 3
    PASSWORD 'CHANGE_ME_BACKUP_PASSWORD';

-- Read-only user role for monitoring
CREATE ROLE pulsex_readonly WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT 20
    PASSWORD 'CHANGE_ME_READONLY_PASSWORD';

-- ============================================================================
-- 2. ROLE PERMISSIONS
-- ============================================================================

-- Application user permissions
GRANT USAGE ON SCHEMA public TO pulsex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pulsex_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pulsex_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pulsex_app;

-- Grant specific permissions for sensitive operations
GRANT EXECUTE ON FUNCTION update_user_last_activity(UUID) TO pulsex_app;
GRANT EXECUTE ON FUNCTION get_user_preferences(UUID) TO pulsex_app;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions() TO pulsex_app;

-- Analytics user permissions (read-only)
GRANT USAGE ON SCHEMA public TO pulsex_analytics;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pulsex_analytics;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsex_analytics;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pulsex_analytics;

-- Migration user permissions
GRANT USAGE ON SCHEMA public TO pulsex_migrations;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pulsex_migrations;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pulsex_migrations;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO pulsex_migrations;
GRANT CREATE ON SCHEMA public TO pulsex_migrations;

-- Backup user permissions
GRANT USAGE ON SCHEMA public TO pulsex_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pulsex_backup;

-- Read-only user permissions
GRANT USAGE ON SCHEMA public TO pulsex_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pulsex_readonly;

-- Ensure future tables get appropriate permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO pulsex_analytics;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pulsex_migrations;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO pulsex_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO pulsex_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO pulsex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO pulsex_migrations;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO pulsex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO pulsex_analytics;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on tables with user data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can only see/update their own profile
CREATE POLICY users_own_profile ON users
    FOR ALL
    USING (id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin')
    WITH CHECK (id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

-- Users can only access their own briefings
CREATE POLICY briefings_own_content ON briefings
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin')
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

-- Users can only access their own feedback
CREATE POLICY feedback_own_data ON user_feedback
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin')
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

-- Users can only access their own saved cards
CREATE POLICY saved_cards_own_data ON saved_cards
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin')
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

-- Users can only access their own notification tokens
CREATE POLICY notification_tokens_own_data ON notification_tokens
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin')
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

-- Users can only access their own sessions
CREATE POLICY sessions_own_data ON sessions
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin')
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

-- Analytics events - users can only see their own
CREATE POLICY analytics_own_data ON analytics_events
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin')
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

-- Audit logs - read-only for users, full access for admins
CREATE POLICY audit_logs_read_only ON audit_logs
    FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true)::UUID OR current_setting('app.current_user_role', true) = 'admin');

CREATE POLICY audit_logs_admin_only ON audit_logs
    FOR INSERT
    WITH CHECK (current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- 4. APPLICATION CONTEXT FUNCTIONS
-- ============================================================================

-- Set application context for RLS
CREATE OR REPLACE FUNCTION set_app_context(user_id UUID, user_role TEXT DEFAULT 'user')
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_id::TEXT, true);
    PERFORM set_config('app.current_user_role', user_role, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear application context
CREATE OR REPLACE FUNCTION clear_app_context()
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_user_role', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current application user ID
CREATE OR REPLACE FUNCTION get_current_app_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_user_id', true)::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. CONNECTION POOLING CONFIGURATION
-- ============================================================================

-- Function to monitor connection pool usage
CREATE OR REPLACE FUNCTION monitor_connection_usage()
RETURNS TABLE (
    role_name TEXT,
    active_connections INTEGER,
    max_connections INTEGER,
    utilization_percent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.rolname as role_name,
        count(*) as active_connections,
        r.rolconnlimit as max_connections,
        CASE
            WHEN r.rolconnlimit = -1 THEN NULL
            ELSE round(count(*)::DECIMAL / r.rolconnlimit * 100, 2)
        END as utilization_percent
    FROM pg_stat_activity a
    JOIN pg_roles r ON a.usename = r.rolname
    WHERE a.state = 'active'
    GROUP BY r.rolname, r.rolconnlimit
    ORDER BY count(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to identify long-running queries
CREATE OR REPLACE FUNCTION get_long_running_queries(threshold_seconds INTEGER DEFAULT 30)
RETURNS TABLE (
    pid INTEGER,
    user_name TEXT,
    database_name TEXT,
    query_text TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    duration_seconds INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.pid,
        a.usename as user_name,
        a.datname as database_name,
        a.query as query_text,
        a.query_start as start_time,
        NOW() - a.query_start as duration_seconds
    FROM pg_stat_activity a
    WHERE a.state = 'active'
      AND a.query_start < NOW() - INTERVAL '1 second' * threshold_seconds
      AND a.query NOT LIKE '%pg_stat_activity%'
    ORDER BY a.query_start;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. PREPARED STATEMENTS
-- ============================================================================

-- Common prepared statements for application use
PREPARE get_user_by_email(TEXT) AS
SELECT id, email, username, password_hash, status, preferences, created_at
FROM users
WHERE email = $1 AND deleted_at IS NULL;

PREPARE get_user_briefing(UUID, DATE) AS
SELECT id, title, cards, summary, published_at, read_time_seconds, completion_rate
FROM briefings
WHERE user_id = $1 AND briefing_date = $2 AND status = 'published';

PREPARE insert_analytics_event(UUID, UUID, TEXT, TEXT, JSONB, INTEGER) AS
INSERT INTO analytics_events (user_id, session_id, event_type, event_name, properties, duration_ms, created_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
RETURNING id;

PREPARE update_briefing_engagement(UUID, INTEGER, INTEGER, DECIMAL) AS
UPDATE briefings
SET view_count = view_count + $2,
    read_time_seconds = read_time_seconds + $3,
    completion_rate = $4,
    updated_at = NOW()
WHERE id = $1
RETURNING view_count, read_time_seconds, completion_rate;

PREPARE get_user_saved_cards(UUID) AS
SELECT id, card_title, card_summary, category, tags, saved_at, last_accessed_at
FROM saved_cards
WHERE user_id = $1
ORDER BY last_accessed_at DESC;

PREPARE insert_user_feedback(UUID, UUID, UUID, feedback_type, TEXT, DECIMAL, TEXT, JSONB) AS
INSERT INTO user_feedback (user_id, briefing_id, card_id, feedback_type, topic, weight, reason, device_info, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
RETURNING id;

-- ============================================================================
-- 7. SESSION MANAGEMENT
-- ============================================================================

-- Function to create and manage user sessions
CREATE OR REPLACE FUNCTION create_user_session(
    user_id UUID,
    session_token VARCHAR(255),
    device_fingerprint VARCHAR(255),
    device_info JSONB,
    expires_hours INTEGER DEFAULT 24
) RETURNS UUID AS $$
DECLARE
    session_uuid UUID;
BEGIN
    -- Deactivate existing sessions for the same device
    UPDATE sessions
    SET is_active = FALSE, last_activity_at = NOW()
    WHERE user_id = user_id
      AND device_fingerprint = device_fingerprint
      AND is_active = TRUE;

    -- Create new session
    INSERT INTO sessions (user_id, session_token, device_fingerprint, device_info, expires_at)
    VALUES (user_id, session_token, device_fingerprint, device_info, NOW() + INTERVAL '1 hour' * expires_hours)
    RETURNING id INTO session_uuid;

    RETURN session_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate and extend session
CREATE OR REPLACE FUNCTION validate_session(session_token VARCHAR(255), extend_hours INTEGER DEFAULT 24)
RETURNS TABLE (
    session_id UUID,
    user_id UUID,
    is_valid BOOLEAN
) AS $$
DECLARE
    session_record RECORD;
BEGIN
    SELECT s.id, s.user_id, s.is_active, s.expires_at
    INTO session_record
    FROM sessions s
    WHERE s.session_token = session_token
      AND s.is_active = TRUE
      AND s.expires_at > NOW();

    IF session_record IS NOT NULL THEN
        -- Extend session expiry and update last activity
        UPDATE sessions
        SET last_activity_at = NOW(),
            expires_at = GREATEST(expires_at, NOW() + INTERVAL '1 hour' * extend_hours)
        WHERE id = session_record.id;

        RETURN QUERY
        SELECT session_record.id, session_record.user_id, TRUE::BOOLEAN;
    ELSE
        RETURN QUERY
        SELECT NULL::UUID, NULL::UUID, FALSE::BOOLEAN;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. MONITORING VIEWS
-- ============================================================================

-- Database health dashboard
CREATE OR REPLACE VIEW database_health AS
SELECT
    'Connections' as metric,
    (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
    (SELECT count(*) FROM pg_stat_activity) as total_connections,
    (SELECT setting::INTEGER FROM pg_settings WHERE name = 'max_connections') as max_connections
UNION ALL
SELECT
    'Cache Hit Rate',
    (SELECT round(sum(blks_hit)::numeric / (sum(blks_hit) + sum(blks_read)), 4) * 100
     FROM pg_stat_database WHERE datname = current_database()),
    NULL,
    NULL
UNION ALL
SELECT
    'Database Size (GB)',
    (SELECT pg_size_pretty(pg_database_size(current_database()))),
    NULL,
    NULL
UNION ALL
SELECT
    'Transactions/sec',
    (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()),
    NULL,
    NULL;

-- User activity summary
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
    COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL) as active_users,
    COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '24 hours') as daily_active,
    COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '7 days') as weekly_active,
    COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '30 days') as monthly_active,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted_users,
    COUNT(DISTINCT DATE(briefing_date)) as briefing_days,
    COUNT(*) FILTER (WHERE status = 'published') as published_briefings
FROM users u
LEFT JOIN briefings b ON u.id = b.user_id;

-- Performance metrics
CREATE OR REPLACE VIEW performance_metrics AS
SELECT
    'Query Performance' as category,
    (SELECT avg(mean_time) FROM pg_stat_statements WHERE query NOT LIKE '%pg_stat_statements%') as avg_query_time_ms,
    (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query_start < NOW() - INTERVAL '30 seconds') as long_queries,
    (SELECT sum(total_time) FROM pg_stat_statements WHERE query NOT LIKE '%pg_stat_statements%') as total_query_time_s
UNION ALL
SELECT
    'Table Sizes',
    (SELECT pg_size_pretty(pg_total_relation_size('users'))),
    (SELECT pg_size_pretty(pg_total_relation_size('briefings'))),
    (SELECT pg_size_pretty(pg_total_relation_size('analytics_events')))
UNION ALL
SELECT
    'Index Usage',
    (SELECT count(*) FROM pg_stat_user_indexes WHERE idx_scan > 0),
    (SELECT count(*) FROM pg_stat_user_indexes),
    (SELECT round((count(*) FILTER (WHERE idx_scan > 0)::DECIMAL / count(*)) * 100, 2) FROM pg_stat_user_indexes);

-- ============================================================================
-- 9. CONFIGURATION RECOMMENDATIONS
-- ============================================================================

-- Connection pool configurations for different environments
DO $$
BEGIN
    RAISE NOTICE '=== Connection Pool Recommendations ===';
    RAISE NOTICE 'Development: 10-20 connections per app instance';
    RAISE NOTICE 'Staging: 25-50 connections per app instance';
    RAISE NOTICE 'Production: 50-100 connections per app instance';
    RAISE NOTICE '';
    RAISE NOTICE 'PgBouncer Configuration:';
    RAISE NOTICE '  pool_mode = transaction';
    RAISE NOTICE '  max_client_conn = 20000';
    RAISE NOTICE '  default_pool_size = 100';
    RAISE NOTICE '  reserve_pool_size = 50';
    RAISE NOTICE '';
    RAISE NOTICE 'Application Settings:';
    RAISE NOTICE '  connectionTimeoutMillis = 2000';
    RAISE NOTICE '  statement_timeout = 5000';
    RAISE NOTICE '  query_timeout = 5000';
    RAISE NOTICE '  idleTimeoutMillis = 30000';
END $$;

-- ============================================================================
-- 10. SECURITY RECOMMENDATIONS
-- ============================================================================

-- Security best practices documentation
COMMENT ON ROLE pulsex_app IS 'Application user with limited permissions for production use';
COMMENT ON ROLE pulsex_analytics IS 'Read-only user for analytics and reporting';
COMMENT ON ROLE pulsex_migrations IS 'Database schema management user';
COMMENT ON ROLE pulsex_backup IS 'Backup user with read-only access';
COMMENT ON ROLE pulsex_readonly IS 'Read-only user for monitoring';

-- Security validation queries
DO $$
BEGIN
    RAISE NOTICE '=== Security Checklist ===';
    RAISE NOTICE '1. Change default passwords for all roles';
    RAISE NOTICE '2. Use SSL/TLS for all database connections';
    RAISE NOTICE '3. Implement proper application context for RLS';
    RAISE NOTICE '4. Monitor connection pool usage regularly';
    RAISE NOTICE '5. Set appropriate statement timeouts';
    RAISE NOTICE '6. Use prepared statements for frequent queries';
    RAISE NOTICE '7. Implement proper logging and monitoring';
END $$;

-- Grant permissions for monitoring functions
GRANT EXECUTE ON FUNCTION monitor_connection_usage() TO pulsex_readonly;
GRANT EXECUTE ON FUNCTION get_long_running_queries(INTEGER) TO pulsex_readonly;