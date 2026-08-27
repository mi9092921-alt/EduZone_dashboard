-- AUTO-GENERATED FROM CANONICAL SOURCE
-- Source of truth: ../../Eduzone_schema_v13.sql
-- Normalization pass #3 ownership rules applied.
-- MEDIUM-04: Prevent physical delete on users
DROP TRIGGER IF EXISTS trg_prevent_physical_delete_users ON public.users;

CREATE TRIGGER trg_prevent_physical_delete_users
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_physical_delete();

-- SEC: Prevent physical delete on tenants (new — completes guard coverage)
DROP TRIGGER IF EXISTS trg_prevent_physical_delete_tenants ON public.tenants;

CREATE TRIGGER trg_prevent_physical_delete_tenants
  BEFORE DELETE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_physical_delete();

DROP TRIGGER IF EXISTS trg_log_pii_access ON public.users;

CREATE TRIGGER trg_log_pii_access
  AFTER UPDATE OF email_encrypted, phone_encrypted ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_pii_access();

DROP TRIGGER IF EXISTS trg_users_email_hardening ON public.users;

CREATE TRIGGER trg_users_email_hardening
  BEFORE INSERT OR UPDATE OF email, phone ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_users_email_hardening();

DROP TRIGGER IF EXISTS trg_increment_token_version_on_role_change ON public.user_roles;

CREATE TRIGGER trg_increment_token_version_on_role_change
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_increment_token_version_on_role_change();

DROP TRIGGER IF EXISTS trg_enforce_permission_scope ON public.role_permissions;

CREATE TRIGGER trg_enforce_permission_scope
  BEFORE INSERT OR UPDATE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enforce_permission_scope();

DROP TRIGGER IF EXISTS trg_role_permissions_invalidate_cache ON public.role_permissions;

CREATE TRIGGER trg_role_permissions_invalidate_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_perm_cache_on_role_permissions();

DROP TRIGGER IF EXISTS trg_invalidate_user_cache_on_status_change ON public.users;

CREATE TRIGGER trg_invalidate_user_cache_on_status_change
  AFTER UPDATE OF account_status, token_version ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_invalidate_user_validity_cache();

DROP TRIGGER IF EXISTS trg_refresh_user_validity ON public.users;

CREATE TRIGGER trg_refresh_user_validity
  AFTER INSERT OR UPDATE OF account_status, deleted_at ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_user_validity();

-- MEDIUM-04: Prevent physical delete on courses
DROP TRIGGER IF EXISTS trg_prevent_physical_delete_courses ON public.courses;

CREATE TRIGGER trg_prevent_physical_delete_courses
  BEFORE DELETE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_physical_delete();

DROP TRIGGER IF EXISTS trg_prevent_prerequisite_cycles ON public.course_prerequisites;

DROP TRIGGER IF EXISTS trg_audit_lesson_state_change ON public.lessons;

-- MEDIUM-04: Prevent physical delete on lessons
DROP TRIGGER IF EXISTS trg_prevent_physical_delete_lessons ON public.lessons;

CREATE TRIGGER trg_prevent_physical_delete_lessons
  BEFORE DELETE ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_physical_delete();

DROP TRIGGER IF EXISTS trg_validate_enrollments_tenant_match ON public.enrollments;

-- MEDIUM-04: Prevent physical delete on enrollments
DROP TRIGGER IF EXISTS trg_prevent_physical_delete_enrollments ON public.enrollments;

CREATE TRIGGER trg_prevent_physical_delete_enrollments
  BEFORE DELETE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_physical_delete();

DROP TRIGGER IF EXISTS trg_sync_user_access_cache ON public.enrollments;

CREATE TRIGGER trg_sync_user_access_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_user_access_cache();

DROP TRIGGER IF EXISTS trg_sessions_management ON public.sessions;

CREATE TRIGGER trg_sessions_management
  AFTER INSERT OR DELETE OR UPDATE OF is_active ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enforce_single_active_session();

DROP TRIGGER IF EXISTS trg_trim_notification_fields ON public.notifications;

CREATE TRIGGER trg_trim_notification_fields
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_trim_notification_fields();

DROP TRIGGER IF EXISTS trg_notify_new_job ON internal.job_queue;

CREATE TRIGGER trg_notify_new_job
  AFTER INSERT ON internal.job_queue
  FOR EACH ROW
  EXECUTE FUNCTION internal.notify_new_job();

DROP TRIGGER IF EXISTS trg_refresh_enrollment_totals_insert ON public.lessons;

CREATE TRIGGER trg_refresh_enrollment_totals_insert
  AFTER INSERT ON public.lessons
  REFERENCING NEW TABLE AS inserted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_enrollment_totals_stmt();

DROP TRIGGER IF EXISTS trg_refresh_enrollment_totals_delete ON public.lessons;

CREATE TRIGGER trg_refresh_enrollment_totals_delete
  AFTER DELETE ON public.lessons
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_enrollment_totals_stmt();

DROP TRIGGER IF EXISTS trg_refresh_enrollment_totals_update ON public.lessons;

CREATE TRIGGER trg_refresh_enrollment_totals_update
  AFTER UPDATE ON public.lessons
  REFERENCING NEW TABLE AS inserted_rows OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_enrollment_totals_stmt();

CREATE TRIGGER trg_audit_lesson_state_change
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW
  WHEN (OLD.is_published <> NEW.is_published)
  EXECUTE FUNCTION public.trg_audit_lesson_state_change();

-- Apply to core tables

DROP TRIGGER IF EXISTS prevent_delete ON public.enrollments;

CREATE TRIGGER prevent_delete BEFORE DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();

CREATE TRIGGER trg_validate_enrollments_tenant_match
  BEFORE INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_enrollments_tenant_match();

-- ============================================================================
-- 007_triggers.sql
-- ============================================================================

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_roles_updated_at ON public.roles;

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_permissions_updated_at ON public.permissions;

CREATE TRIGGER trg_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_courses_updated_at ON public.courses;

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sections_updated_at ON public.sections;

CREATE TRIGGER trg_sections_updated_at
  BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lessons_updated_at ON public.lessons;

CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lesson_contents_updated_at ON public.lesson_contents;

CREATE TRIGGER trg_lesson_contents_updated_at
  BEFORE UPDATE ON public.lesson_contents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sections_cascade_delete ON public.sections;

CREATE TRIGGER trg_sections_cascade_delete
  BEFORE DELETE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.trg_cascade_section_deletes();

DROP TRIGGER IF EXISTS trg_enrollments_updated_at ON public.enrollments;

CREATE TRIGGER trg_enrollments_updated_at
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_progress_updated_at ON public.user_progress;

CREATE TRIGGER trg_user_progress_updated_at
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_todos_updated_at ON public.todos;

CREATE TRIGGER trg_todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_push_tokens_updated_at ON public.push_tokens;

CREATE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_push_deliveries_updated_at ON public.push_deliveries;

CREATE TRIGGER trg_push_deliveries_updated_at
  BEFORE UPDATE ON public.push_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_roles_sync_combined_ins_del ON public.user_roles;

DROP TRIGGER IF EXISTS trg_user_roles_sync_combined_upd ON public.user_roles;

CREATE TRIGGER trg_user_roles_sync_combined_ins_del
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.trg_sync_user_roles();

CREATE TRIGGER trg_user_roles_sync_combined_upd
  AFTER UPDATE OF is_active, role_id, expires_at ON public.user_roles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0 AND OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION public.trg_sync_user_roles();

DROP TRIGGER IF EXISTS trg_settings_cache_invalidation_ins ON public.settings_kv;

CREATE TRIGGER trg_settings_cache_invalidation_ins
  AFTER INSERT ON public.settings_kv
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_settings_cache();

DROP TRIGGER IF EXISTS trg_settings_cache_invalidation_upd ON public.settings_kv;

CREATE TRIGGER trg_settings_cache_invalidation_upd
  AFTER UPDATE ON public.settings_kv
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION public.sync_settings_cache();

DROP TRIGGER IF EXISTS trg_update_last_location ON public.user_location_logs;

CREATE TRIGGER trg_update_last_location
  AFTER INSERT ON public.user_location_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_user_last_location();

DROP TRIGGER IF EXISTS trg_up_enrollment_progress_ins ON public.user_progress;

CREATE TRIGGER trg_up_enrollment_progress_ins
  AFTER INSERT ON public.user_progress
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.trg_update_enrollment_progress();

DROP TRIGGER IF EXISTS trg_up_enrollment_progress_upd ON public.user_progress;

CREATE TRIGGER trg_up_enrollment_progress_upd
  AFTER UPDATE OF completed, completed_at, progress_pct, watch_time_sec, last_watched
  ON public.user_progress
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0 AND OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION public.trg_update_enrollment_progress();

DROP TRIGGER IF EXISTS trg_notification_fanout ON public.notifications;

CREATE TRIGGER trg_notification_fanout
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fanout_notification();

DROP TRIGGER IF EXISTS trg_course_invalidations_ins_del ON public.courses;

CREATE TRIGGER trg_course_invalidations_ins_del
  AFTER INSERT OR DELETE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION internal.queue_course_cache_purge();

DROP TRIGGER IF EXISTS trg_course_invalidations_upd ON public.courses;

CREATE TRIGGER trg_course_invalidations_upd
  AFTER UPDATE ON public.courses
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION internal.queue_course_cache_purge();

DROP TRIGGER IF EXISTS trg_lesson_notify ON public.lessons;

CREATE TRIGGER trg_lesson_notify
  AFTER UPDATE OF is_published ON public.lessons
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION public.trg_lessons_publish_notify();

DROP TRIGGER IF EXISTS tr_audit_access_rules ON public.access_rules;

CREATE TRIGGER tr_audit_access_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.access_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_access_rule_change();

-- Apply trigger to the parent table (will propagate to partitions if using PG13+)
DROP TRIGGER IF EXISTS trg_hash_chain_activity_logs ON public.activity_logs;

CREATE TRIGGER trg_hash_chain_activity_logs
  BEFORE INSERT ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_hash_chain_activity_logs();

DROP TRIGGER IF EXISTS trg_prevent_activity_logs_mutation ON public.activity_logs;

CREATE TRIGGER trg_prevent_activity_logs_mutation
BEFORE UPDATE OR DELETE ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_warnings_immutable ON public.warnings;

CREATE TRIGGER trg_warnings_immutable
BEFORE UPDATE OR DELETE ON public.warnings
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_alert_log_mutation ON audit.alert_log;

CREATE TRIGGER trg_prevent_alert_log_mutation
BEFORE UPDATE OR DELETE ON audit.alert_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_users_status_terminate ON public.users;

CREATE TRIGGER trg_users_status_terminate
  AFTER UPDATE OF account_status ON public.users
  FOR EACH ROW
  WHEN (OLD.account_status IS DISTINCT FROM NEW.account_status)
  EXECUTE FUNCTION public.terminate_sessions_on_status_change();

CREATE TRIGGER trg_prevent_prerequisite_cycles
  BEFORE INSERT OR UPDATE ON public.course_prerequisites
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prevent_prerequisite_cycles();

-- =============================================================================
-- STABILITY: Cascading Soft-Delete — bind trg_cascade_course_soft_delete()
-- Fires BEFORE a course's deleted_at is set (non-NULL), propagating the same
-- timestamp to child lessons and enrollments atomically within the same txn.
-- Defined in 07_functions.sql as public.trg_cascade_course_soft_delete().
-- =============================================================================
DROP TRIGGER IF EXISTS trg_cascade_course_soft_delete ON public.courses;

CREATE TRIGGER trg_cascade_course_soft_delete
  BEFORE UPDATE OF deleted_at ON public.courses
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.trg_cascade_course_soft_delete();

-- ============================================================================
-- Feature Flags — timestamps, revisions, audit trail
-- ============================================================================

DROP TRIGGER IF EXISTS trg_feature_flags_touch ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_touch
BEFORE INSERT OR UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_feature_flag_row();

DROP TRIGGER IF EXISTS trg_tenant_feature_flags_touch ON public.tenant_feature_flags;
CREATE TRIGGER trg_tenant_feature_flags_touch
BEFORE INSERT OR UPDATE ON public.tenant_feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_feature_flag_row();

DROP TRIGGER IF EXISTS trg_feature_flag_users_touch ON public.feature_flag_users;
CREATE TRIGGER trg_feature_flag_users_touch
BEFORE INSERT OR UPDATE ON public.feature_flag_users
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_feature_flag_row();

DROP TRIGGER IF EXISTS trg_feature_flag_roles_touch ON public.feature_flag_roles;
CREATE TRIGGER trg_feature_flag_roles_touch
BEFORE INSERT OR UPDATE ON public.feature_flag_roles
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_feature_flag_row();

DROP TRIGGER IF EXISTS trg_feature_flags_audit ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_audit
AFTER INSERT OR UPDATE OR DELETE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.trg_audit_feature_flag_change();

DROP TRIGGER IF EXISTS trg_tenant_feature_flags_audit ON public.tenant_feature_flags;
CREATE TRIGGER trg_tenant_feature_flags_audit
AFTER INSERT OR UPDATE OR DELETE ON public.tenant_feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.trg_audit_feature_flag_change();

DROP TRIGGER IF EXISTS trg_feature_flag_users_audit ON public.feature_flag_users;
CREATE TRIGGER trg_feature_flag_users_audit
AFTER INSERT OR UPDATE OR DELETE ON public.feature_flag_users
FOR EACH ROW
EXECUTE FUNCTION public.trg_audit_feature_flag_change();

DROP TRIGGER IF EXISTS trg_feature_flag_roles_audit ON public.feature_flag_roles;
CREATE TRIGGER trg_feature_flag_roles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.feature_flag_roles
FOR EACH ROW
EXECUTE FUNCTION public.trg_audit_feature_flag_change();

