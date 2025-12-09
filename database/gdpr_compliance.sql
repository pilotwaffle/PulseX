-- GDPR Compliance Functions for PulseX Daily Briefing App
-- Provides data export, deletion, and anonymization capabilities
-- Version: 1.0.0

-- ============================================================================
-- 1. USER DATA EXPORT FUNCTIONS
-- ============================================================================

-- Comprehensive user data export function
CREATE OR REPLACE FUNCTION export_user_data(user_email VARCHAR(255))
RETURNS JSONB AS $$
DECLARE
    target_user_id UUID;
    user_data JSONB;
    user_briefings JSONB;
    user_feedback JSONB;
    user_saved_cards JSONB;
    user_sessions JSONB;
    user_audit_logs JSONB;
    user_analytics JSONB;
    notification_tokens JSONB;
    export_data JSONB;
BEGIN
    -- Get user ID
    SELECT id INTO target_user_id FROM users WHERE email = user_email AND deleted_at IS NULL;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found or already deleted';
    END IF;

    -- Export user profile data (excluding password hash)
    SELECT jsonb_build_object(
        'id', id,
        'email', email,
        'username', username,
        'first_name', first_name,
        'last_name', last_name,
        'phone', phone,
        'avatar_url', avatar_url,
        'status', status,
        'email_verified', email_verified,
        'phone_verified', phone_verified,
        'last_login_at', last_login_at,
        'last_active_at', last_active_at,
        'preferences', preferences,
        'interests', interests,
        'onboarding_step', onboarding_step,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO user_data
    FROM users
    WHERE id = target_user_id;

    -- Export user briefings
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'title', title,
            'subtitle', subtitle,
            'briefing_date', briefing_date,
            'status', status,
            'version', version,
            'cards', cards,
            'summary', summary,
            'metadata', metadata,
            'view_count', view_count,
            'read_time_seconds', read_time_seconds,
            'completion_rate', completion_rate,
            'generated_at', generated_at,
            'published_at', published_at,
            'created_at', created_at,
            'updated_at', updated_at
        )
    ) INTO user_briefings
    FROM briefings
    WHERE user_id = target_user_id;

    -- Export user feedback
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'briefing_id', briefing_id,
            'card_id', card_id,
            'feedback_type', feedback_type,
            'topic', topic,
            'weight', weight,
            'reason', reason,
            'session_id', session_id,
            'device_info', device_info,
            'created_at', created_at
        )
    ) INTO user_feedback
    FROM user_feedback
    WHERE user_id = target_user_id;

    -- Export saved cards
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'briefing_id', briefing_id,
            'card_id', card_id,
            'card_content', card_content,
            'card_title', card_title,
            'card_summary', card_summary,
            'tags', tags,
            'category', category,
            'saved_at', saved_at,
            'last_accessed_at', last_accessed_at
        )
    ) INTO user_saved_cards
    FROM saved_cards
    WHERE user_id = target_user_id;

    -- Export sessions (excluding session tokens for security)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'device_fingerprint', device_fingerprint,
            'device_info', device_info,
            'is_active', is_active,
            'last_activity_at', last_activity_at,
            'created_at', created_at,
            'expires_at', expires_at
        )
    ) INTO user_sessions
    FROM sessions
    WHERE user_id = target_user_id;

    -- Export audit logs
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'action', action,
            'table_name', table_name,
            'record_id', record_id,
            'old_values', old_values,
            'new_values', new_values,
            'ip_address', ip_address,
            'session_id', session_id,
            'created_at', created_at
        )
    ) INTO user_audit_logs
    FROM audit_logs
    WHERE user_id = target_user_id;

    -- Export analytics events
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'event_type', event_type,
            'event_name', event_name,
            'properties', properties,
            'duration_ms', duration_ms,
            'ip_address', ip_address,
            'created_at', created_at
        )
    ) INTO user_analytics
    FROM analytics_events
    WHERE user_id = target_user_id;

    -- Export notification tokens (excluding actual tokens)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'platform', platform,
            'device_id', device_id,
            'app_version', app_version,
            'is_active', is_active,
            'last_used_at', last_used_at,
            'created_at', created_at,
            'updated_at', updated_at
        )
    ) INTO notification_tokens
    FROM notification_tokens
    WHERE user_id = target_user_id;

    -- Combine all data
    export_data := jsonb_build_object(
        'user_profile', user_data,
        'briefings', COALESCE(user_briefings, '[]'::jsonb),
        'feedback', COALESCE(user_feedback, '[]'::jsonb),
        'saved_cards', COALESCE(user_saved_cards, '[]'::jsonb),
        'sessions', COALESCE(user_sessions, '[]'::jsonb),
        'audit_logs', COALESCE(user_audit_logs, '[]'::jsonb),
        'analytics_events', COALESCE(user_analytics, '[]'::jsonb),
        'notification_tokens', COALESCE(notification_tokens, '[]'::jsonb),
        'export_timestamp', NOW(),
        'export_version', '1.0.0'
    );

    RETURN export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. USER DATA DELETION FUNCTIONS
-- ============================================================================

-- Soft delete user (GDPR compliant - maintains data integrity)
CREATE OR REPLACE FUNCTION soft_delete_user(user_email VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get user ID
    SELECT id INTO target_user_id FROM users WHERE email = user_email AND deleted_at IS NULL;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found or already deleted';
    END IF;

    -- Start transaction for atomic deletion
    BEGIN
        -- Soft delete user profile
        UPDATE users
        SET
            deleted_at = NOW(),
            email = 'deleted_' || id::TEXT || '@deleted.com',
            username = 'deleted_user_' || id::TEXT,
            password_hash = '',
            first_name = NULL,
            last_name = NULL,
            phone = NULL,
            avatar_url = NULL,
            preferences = '{}',
            interests = '[]',
            status = 'inactive'
        WHERE id = target_user_id;

        -- Deactivate all sessions
        UPDATE sessions
        SET is_active = FALSE, last_activity_at = NOW()
        WHERE user_id = target_user_id;

        -- Deactivate notification tokens
        UPDATE notification_tokens
        SET is_active = FALSE, last_used_at = NOW()
        WHERE user_id = target_user_id;

        -- Log the deletion in audit logs
        INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, created_at)
        VALUES (target_user_id, 'delete', 'users', target_user_id,
                jsonb_build_object('action', 'soft_delete', 'timestamp', NOW()), NOW());

        COMMIT;
        RETURN TRUE;

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hard delete user (for administrative purposes only)
CREATE OR REPLACE FUNCTION hard_delete_user(user_email VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get user ID
    SELECT id INTO target_user_id FROM users WHERE email = user_email;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Start transaction for atomic deletion
    BEGIN
        -- Delete in order of foreign key dependencies
        DELETE FROM analytics_events WHERE user_id = target_user_id;
        DELETE FROM user_feedback WHERE user_id = target_user_id;
        DELETE FROM saved_cards WHERE user_id = target_user_id;
        DELETE FROM briefings WHERE user_id = target_user_id;
        DELETE FROM sessions WHERE user_id = target_user_id;
        DELETE FROM notification_tokens WHERE user_id = target_user_id;
        DELETE FROM audit_logs WHERE user_id = target_user_id;
        DELETE FROM users WHERE id = target_user_id;

        COMMIT;
        RETURN TRUE;

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. DATA ANONYMIZATION FUNCTIONS
-- ============================================================================

-- Anonymize user data while preserving analytics
CREATE OR REPLACE FUNCTION anonymize_user_data(user_email VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
    target_user_id UUID;
    anonymized_id UUID;
BEGIN
    -- Get user ID
    SELECT id INTO target_user_id FROM users WHERE email = user_email AND deleted_at IS NULL;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found or already deleted';
    END IF;

    -- Generate anonymized ID
    anonymized_id := uuid_generate_v4();

    -- Start transaction for atomic anonymization
    BEGIN
        -- Anonymize user profile
        UPDATE users
        SET
            email = 'anonymized_' || anonymized_id::TEXT || '@anonymized.com',
            username = 'user_' || anonymized_id::TEXT,
            password_hash = 'ANONYMIZED',
            first_name = 'Anonymous',
            last_name = 'User',
            phone = NULL,
            avatar_url = NULL,
            preferences = '{}',
            interests = '[]',
            status = 'inactive',
            deleted_at = NOW()
        WHERE id = target_user_id;

        -- Anonymize sessions
        UPDATE sessions
        SET device_fingerprint = 'ANONYMIZED',
            device_info = '{}'
        WHERE user_id = target_user_id;

        -- Anonymize notification tokens
        UPDATE notification_tokens
        SET token = 'ANONYMIZED',
            device_id = 'ANONYMIZED'
        WHERE user_id = target_user_id;

        -- Anonymize feedback (remove personally identifying information)
        UPDATE user_feedback
        SET reason = NULL,
            device_info = '{}'
        WHERE user_id = target_user_id;

        -- Anonymize audit logs
        UPDATE audit_logs
        SET ip_address = NULL,
            user_agent = 'ANONYMIZED'
        WHERE user_id = target_user_id;

        -- Anonymize analytics events
        UPDATE analytics_events
        SET ip_address = NULL,
            properties = jsonb_set(properties, '{user_agent}', '"ANONYMIZED"', true)
        WHERE user_id = target_user_id;

        -- Log the anonymization
        INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, created_at)
        VALUES (target_user_id, 'update', 'users', target_user_id,
                jsonb_build_object('action', 'anonymize', 'anonymized_id', anonymized_id, 'timestamp', NOW()), NOW());

        COMMIT;
        RETURN TRUE;

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. DATA RETENTION FUNCTIONS
-- ============================================================================

-- Clean up old analytics data (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_analytics(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_events
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old audit logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 2555) -- 7 years
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions
    WHERE (is_active = FALSE AND last_activity_at < NOW() - INTERVAL '1 day' * retention_days)
       OR expires_at < NOW() - INTERVAL '1 day' * retention_days;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. COMPLIANCE REPORTING FUNCTIONS
-- ============================================================================

-- Generate user data inventory (for GDPR compliance reporting)
CREATE OR REPLACE FUNCTION generate_user_data_inventory()
RETURNS TABLE (
    table_name TEXT,
    record_count BIGINT,
    data_types TEXT,
    retention_policy TEXT,
    last_accessed TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        'users'::TEXT,
        COUNT(*)::BIGINT,
        'profile, preferences, authentication data'::TEXT,
        'Soft delete retained for 7 years'::TEXT,
        MAX(last_active_at) as last_accessed
    FROM users WHERE deleted_at IS NULL

    UNION ALL

    SELECT
        'briefings',
        COUNT(*),
        'personalized content, reading metrics',
        'Retained for user account lifetime',
        MAX(published_at),
    FROM briefings

    UNION ALL

    SELECT
        'user_feedback',
        COUNT(*),
        'engagement data, preferences, device info',
        'Anonymized after account deletion',
        MAX(created_at),
    FROM user_feedback

    UNION ALL

    SELECT
        'saved_cards',
        COUNT(*),
        'bookmarked content, user tags',
        'Deleted with user account',
        MAX(last_accessed_at),
    FROM saved_cards

    UNION ALL

    SELECT
        'analytics_events',
        COUNT(*),
        'usage patterns, performance metrics',
        'Retained for 365 days',
        MAX(created_at),
    FROM analytics_events

    UNION ALL

    SELECT
        'audit_logs',
        COUNT(*),
        'system access logs, data changes',
        'Retained for 7 years',
        MAX(created_at),
    FROM audit_logs;
END;
$$ LANGUAGE plpgsql;

-- Generate privacy impact assessment
CREATE OR REPLACE FUNCTION generate_privacy_impact_assessment()
RETURNS JSONB AS $$
DECLARE
    assessment JSONB;
BEGIN
    assessment := jsonb_build_object(
        'assessment_date', NOW(),
        'data_collection_purposes', jsonb_build_array(
            jsonb_build_object('purpose', 'Personalized briefings', 'legal_basis', 'Contractual necessity'),
            jsonb_build_object('purpose', 'Usage analytics', 'legal_basis', 'Legitimate interest'),
            jsonb_build_object('purpose', 'Service improvement', 'legal_basis', 'Legitimate interest')
        ),
        'data_categories', jsonb_build_array(
            'Personal identifiers (email, username)',
            'Usage preferences and interests',
            'Reading behavior and engagement metrics',
            'Device and session information',
            'Content consumption patterns'
        ),
        'data_retention', jsonb_build_object(
            'user_data', 'Until account deletion',
            'analytics_data', '365 days',
            'audit_logs', '7 years',
            'session_data', '30 days after expiry'
        ),
        'data_processing_activities', jsonb_build_array(
            'Data collection and storage',
            'Content personalization',
            'Analytics and reporting',
            'Notification delivery',
            'Service maintenance'
        ),
        'security_measures', jsonb_build_array(
            'Encryption at rest and in transit',
            'Access control and authentication',
            'Regular security audits',
            'Data minimization principles',
            'Privacy by design architecture'
        ),
        'user_rights', jsonb_build_array(
            'Right to access personal data',
            'Right to rectification',
            'Right to erasure (right to be forgotten)',
            'Right to data portability',
            'Right to object to processing',
            'Right to restriction of processing'
        ),
        'international_transfers', jsonb_build_object(
            'data_centers', 'US-based',
            'transfer_mechanism', 'Standard Contractual Clauses',
            'adequacy_decision', 'N/A'
        )
    );

    RETURN assessment;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. ADMINISTRATIVE FUNCTIONS
-- ============================================================================

-- Get summary of all users for admin dashboard
CREATE OR REPLACE FUNCTION get_users_summary()
RETURNS TABLE (
    total_users BIGINT,
    active_users BIGINT,
    inactive_users BIGINT,
    onboarding_users BIGINT,
    deleted_users BIGINT,
    avg_briefings_per_user DECIMAL,
    avg_completion_rate DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL) as active_users,
        COUNT(*) FILTER (WHERE status = 'inactive' AND deleted_at IS NULL) as inactive_users,
        COUNT(*) FILTER (WHERE status = 'onboarding' AND deleted_at IS NULL) as onboarding_users,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted_users,
        COALESCE(AVG(briefing_counts.count), 0) as avg_briefings_per_user,
        COALESCE(AVG(briefing_counts.avg_completion), 0) as avg_completion_rate
    FROM users u
    LEFT JOIN (
        SELECT
            user_id,
            COUNT(*) as count,
            AVG(completion_rate) as avg_completion
        FROM briefings
        WHERE status = 'published'
        GROUP BY user_id
    ) briefing_counts ON u.id = briefing_counts.user_id;
END;
$$ LANGUAGE plpgsql;

-- Create GDPR compliance scheduler function
CREATE OR REPLACE FUNCTION schedule_gdpr_cleanup()
RETURNS VOID AS $$
BEGIN
    -- Clean up old analytics events (older than 1 year)
    PERFORM cleanup_old_analytics(365);

    -- Clean up old sessions (older than 30 days)
    PERFORM cleanup_old_sessions(30);

    -- Clean up expired notification tokens
    UPDATE notification_tokens
    SET is_active = FALSE
    WHERE is_active = TRUE
    AND last_used_at < NOW() - INTERVAL '90 days';

    -- Log cleanup activity
    INSERT INTO audit_logs (action, table_name, new_values, created_at)
    VALUES ('update', 'system',
            jsonb_build_object('action', 'scheduled_cleanup', 'timestamp', NOW()), NOW());
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions for GDPR functions
-- GRANT EXECUTE ON FUNCTION export_user_data(TEXT) TO gdpr_admin;
-- GRANT EXECUTE ON FUNCTION soft_delete_user(TEXT) TO gdpr_admin;
-- GRANT EXECUTE ON FUNCTION anonymize_user_data(TEXT) TO gdpr_admin;
-- GRANT EXECUTE ON FUNCTION generate_user_data_inventory() TO gdpr_admin;
-- GRANT EXECUTE ON FUNCTION generate_privacy_impact_assessment() TO gdpr_admin;

-- Comments for documentation
COMMENT ON FUNCTION export_user_data(TEXT) IS 'Exports all user data in GDPR-compliant JSON format';
COMMENT ON FUNCTION soft_delete_user(TEXT) IS 'Soft deletes user while maintaining data integrity';
COMMENT ON FUNCTION hard_delete_user(TEXT) IS 'Permanently deletes user and all associated data';
COMMENT ON FUNCTION anonymize_user_data(TEXT) IS 'Anonymizes user data while preserving analytics';
COMMENT ON FUNCTION generate_user_data_inventory() IS 'Generates data inventory for compliance reporting';
COMMENT ON FUNCTION generate_privacy_impact_assessment() IS 'Creates privacy impact assessment document';