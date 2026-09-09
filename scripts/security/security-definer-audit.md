# SECURITY DEFINER Audit Matrix

_Generated from supabase/schema/07_functions.sql + 03_tables.sql + 10_permissions.sql. Commit-scoped evidence, not a PASS certificate._

| # | Function | search_path | In-body guards | Grants |
|---|---|---|---|---|
| 1 | `audit.check_default_partition_leak` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 2 | `internal.apply_enrollment_progress_update` | `public, pg_temp` | - | no explicit grant lines |
| 3 | `internal.apply_update_enrollment_totals_course` | `public, pg_temp` | - | no explicit grant lines |
| 4 | `internal.cleanup_old_jobs` | `public, pg_temp` | - | no explicit grant lines |
| 5 | `internal.dequeue_job` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 6 | `internal.execute_background_job` | `public, pg_temp` | tenant | no explicit grant lines |
| 7 | `internal.invoke_notification_push_worker` | `public, internal, pg_temp` | - | GRANT EXECUTE; REVOKE ALL |
| 8 | `internal.log_activity_internal` | `public, pg_temp` | tenant | no explicit grant lines |
| 9 | `internal.notify_new_job` | `public, pg_temp` | - | no explicit grant lines |
| 10 | `internal.process_cache_purges` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 11 | `internal.process_enrollment_progress_jobs` | `public, pg_temp` | tenant | no explicit grant lines |
| 12 | `internal.process_notification_fanout_jobs` | `public, internal, pg_temp` | tenant | GRANT EXECUTE; REVOKE ALL |
| 13 | `internal.process_prune_cache` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 14 | `internal.process_update_enrollment_totals_jobs` | `public, pg_temp` | - | no explicit grant lines |
| 15 | `internal.purge_expired_rate_limits` | `public, pg_temp` | - | no explicit grant lines |
| 16 | `internal.purge_soft_deleted_records` | `public, pg_temp` | - | no explicit grant lines |
| 17 | `internal.queue_course_cache_purge` | `public, pg_temp` | - | no explicit grant lines |
| 18 | `maintenance.archive_old_partitions` | `public, pg_temp` | - | no explicit grant lines |
| 19 | `maintenance.archive_soft_deleted_data` | `''` | tenant | no explicit grant lines |
| 20 | `maintenance.create_next_partition_if_not_exists` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 21 | `maintenance.get_unused_indexes` | `public, pg_temp` | - | no explicit grant lines |
| 22 | `maintenance.manage_partitions` | `public, pg_temp` | - | no explicit grant lines |
| 23 | `maintenance.rehydrate_enrollment_progress` | `''` | - | no explicit grant lines |
| 24 | `maintenance.vacuum_partition` | `public, pg_temp` | - | no explicit grant lines |
| 25 | `private.current_jwt_session_id` | `''` | - | no explicit grant lines |
| 26 | `private.current_jwt_token_version` | `''` | - | GRANT EXECUTE; REVOKE ALL |
| 27 | `private.get_kms_key` | `''` | - | GRANT EXECUTE; REVOKE ALL |
| 28 | `private.has_course_access` | `public, pg_temp` | perm | no explicit grant lines |
| 29 | `private.prune_expired_access_cache` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 30 | `private.refresh_all_materialized_views` | `public, pg_temp` | perm+perm | GRANT EXECUTE |
| 31 | `private.refresh_dashboard_stats` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 32 | `private.revoke_auth_sessions` | `''` | - | no explicit grant lines |
| 33 | `private.sync_user_access_cache` | `public, pg_temp` | tenant | no explicit grant lines |
| 34 | `private.user_enrolled_in_course` | `public, pg_temp` | - | no explicit grant lines |
| 35 | `public._get_tenant_fallback` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 36 | `public._session_status` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 37 | `public.admin_cancel_job` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 38 | `public.admin_enqueue_bulk_job` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 39 | `public.admin_get_job` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 40 | `public.admin_get_job_counts` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 41 | `public.admin_get_jobs` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 42 | `public.admin_retry_job` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 43 | `public.api_update_profile` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE ALL |
| 44 | `public.assert_tenant` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 45 | `public.assert_valid_session` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE |
| 46 | `public.authorize_offline_download` | `''` | auth.uid+perm | GRANT EXECUTE; REVOKE ALL |
| 47 | `public.bind_device_for_current_user` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE ALL |
| 48 | `public.check_and_increment_rate_limit` | `public, pg_temp` | tenant | no explicit grant lines |
| 49 | `public.check_dashboard_access` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 50 | `public.check_gdpr_compliance` | `public, pg_temp` | - | no explicit grant lines |
| 51 | `public.check_lesson_access` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE EXECUTE |
| 52 | `public.check_rate_limit` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE ALL; REVOKE ALL |
| 53 | `public.check_rate_limit` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE ALL; REVOKE ALL |
| 54 | `public.check_schema_naming_conventions` | `public, pg_temp` | tenant | no explicit grant lines |
| 55 | `public.check_student_app_access` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 56 | `public.claim_push_delivery` | `public, internal, pg_temp` | - | GRANT EXECUTE; REVOKE ALL |
| 57 | `public.cleanup_test_data` | `public, pg_temp` | tenant | no explicit grant lines |
| 58 | `public.complete_notification_push_job` | `public, internal, pg_temp` | - | GRANT EXECUTE; REVOKE ALL |
| 59 | `public.complete_push_delivery` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE ALL |
| 60 | `public.control_user_account` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; GRANT EXECUTE; REVOKE EXECUTE |
| 61 | `public.current_user_session` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 62 | `public.custom_access_token` | `public, pg_temp` | tenant+perm | GRANT EXECUTE; GRANT EXECUTE; REVOKE ALL |
| 63 | `public.deactivate_push_token` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE ALL |
| 64 | `public.decrypt_pii` | `extensions, public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 65 | `public.delete_notification` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 66 | `public.dequeue_job` | `public, pg_temp` | perm+perm | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 67 | `public.disable_maintenance_mode` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 68 | `public.enable_maintenance_mode` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 69 | `public.encrypt_pii` | `extensions, public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 70 | `public.enforce_jwt_tenant` | `public, pg_temp AS` | tenant | no explicit grant lines |
| 71 | `public.enroll_in_course` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 72 | `public.enroll_student` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 73 | `public.evaluate_feature_flag` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; GRANT EXECUTE; REVOKE ALL |
| 74 | `public.evaluate_feature_flags` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE ALL |
| 75 | `public.extend_enrollment` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE ALL; REVOKE EXECUTE |
| 76 | `public.fail_push_delivery` | `public, internal, pg_temp` | - | GRANT EXECUTE; REVOKE ALL |
| 77 | `public.fanout_notification` | `public, pg_temp` | tenant | no explicit grant lines |
| 78 | `public.feature_flag_rollout_bucket` | `''` | tenant | REVOKE ALL |
| 79 | `public.find_user_by_email` | `public, pg_temp` | tenant | no explicit grant lines |
| 80 | `public.flush_activity_logs` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 81 | `public.get_auth_user_id` | `public, pg_temp AS` | auth.uid | GRANT EXECUTE; REVOKE EXECUTE |
| 82 | `public.get_auth_user_tenant_id` | `public, pg_temp` | tenant | no explicit grant lines |
| 83 | `public.get_constant` | `''` | trigger-helper | n/a |
| 84 | `public.get_constant` | `public, pg_temp` | - | GRANT EXECUTE |
| 85 | `public.get_course_lessons_with_access` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 86 | `public.get_course_outline` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 87 | `public.get_course_progress_summary` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 88 | `public.get_course_stats` | `public, pg_temp` | tenant | no explicit grant lines |
| 89 | `public.get_current_tenant_id` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 90 | `public.get_daily_activity` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 91 | `public.get_dashboard_stats` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 92 | `public.get_default_region_id` | `''` | trigger-helper | n/a |
| 93 | `public.get_default_region_id` | `public, pg_temp` | - | GRANT EXECUTE |
| 94 | `public.get_lesson_content` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE EXECUTE |
| 95 | `public.get_my_enrolled_courses` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 96 | `public.get_my_recent_courses` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 97 | `public.get_my_resume_lesson` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 98 | `public.get_my_students` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 99 | `public.get_own_primary_role` | `public, pg_temp` | auth.uid | no explicit grant lines |
| 100 | `public.get_public_settings` | `public, pg_temp` | - | GRANT EXECUTE |
| 101 | `public.get_setting` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 102 | `public.get_student_progress_timeline` | `public, pg_temp` | tenant | no explicit grant lines |
| 103 | `public.get_system_health` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 104 | `public.get_tenants_usage` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 105 | `public.get_user_role_by_id` | `public, pg_temp` | - | no explicit grant lines |
| 106 | `public.get_users_paginated` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 107 | `public.get_valid_constant_values` | `public, pg_temp` | - | no explicit grant lines |
| 108 | `public.has_course_access` | `public, pg_temp` | auth.uid+perm | no explicit grant lines |
| 109 | `public.has_course_access` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 110 | `public.increment_token_version` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 111 | `public.increment_warning_count` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 112 | `public.is_admin_with_session_validation` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 113 | `public.is_current_user_admin` | `public, pg_temp AS` | perm+perm | GRANT EXECUTE; REVOKE EXECUTE |
| 114 | `public.is_current_user_admin_lite` | `public, pg_temp AS` | perm+perm | no explicit grant lines |
| 115 | `public.is_current_user_super_admin` | `public, pg_temp AS` | auth.uid | GRANT EXECUTE; GRANT EXECUTE; REVOKE EXECUTE |
| 116 | `public.is_current_user_super_admin_lite` | `public, pg_temp AS` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 117 | `public.is_current_user_teacher` | `public, pg_temp` | auth.uid | GRANT EXECUTE; REVOKE EXECUTE |
| 118 | `public.is_enrolled_in_course` | `public, pg_temp` | auth.uid+perm | GRANT EXECUTE; REVOKE EXECUTE |
| 119 | `public.is_feature_enabled` | `public, pg_temp` | - | GRANT EXECUTE; GRANT EXECUTE; REVOKE ALL |
| 120 | `public.is_feature_enabled_for_user` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE ALL |
| 121 | `public.is_teacher_of_course` | `public, pg_temp` | tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 122 | `public.is_user_valid_cached` | `public, pg_temp` | tenant | no explicit grant lines |
| 123 | `public.issue_warning` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 124 | `public.lock_app_for_all` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 125 | `public.log_activity_async` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE ALL |
| 126 | `public.log_my_activity` | `public, pg_temp` | auth.uid | GRANT EXECUTE; REVOKE ALL |
| 127 | `public.log_security_alert` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 128 | `public.logout_current_user` | `public, pg_temp` | auth.uid | GRANT EXECUTE; REVOKE EXECUTE |
| 129 | `public.normalize_email` | `public, pg_temp` | - | no explicit grant lines |
| 130 | `public.prevent_audit_mutation` | `public, pg_temp` | - | no explicit grant lines |
| 131 | `public.prevent_physical_delete` | `public, pg_temp` | - | no explicit grant lines |
| 132 | `public.process_notification_fanout_jobs` | `public, internal, pg_temp` | - | GRANT EXECUTE; REVOKE ALL |
| 133 | `public.rebuild_permission_cache` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 134 | `public.record_current_user_activity` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE ALL |
| 135 | `public.refresh_all_materialized_views` | `public, pg_temp` | - | GRANT EXECUTE |
| 136 | `public.register_push_token` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE ALL |
| 137 | `public.release_stale_job_locks` | `public, pg_temp` | perm+perm | no explicit grant lines |
| 138 | `public.reorder_course_sections` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 139 | `public.reorder_section_lessons` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 140 | `public.reset_user_device` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 141 | `public.revalidate_offline_entitlement` | `''` | auth.uid+perm | GRANT EXECUTE; REVOKE ALL |
| 142 | `public.revoke_enrollment` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 143 | `public.search_courses_ranked` | `public, pg_temp` | tenant | no explicit grant lines |
| 144 | `public.seed_test_data` | `public, pg_temp` | tenant | no explicit grant lines |
| 145 | `public.send_notification` | `public, pg_temp` | - | no explicit grant lines |
| 146 | `public.send_notification` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 147 | `public.set_setting` | `public, pg_temp` | - | no explicit grant lines |
| 148 | `public.set_setting` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 149 | `public.soft_delete_user` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 150 | `public.sync_primary_role` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 151 | `public.sync_primary_role_for_user` | `public, pg_temp` | - | no explicit grant lines |
| 152 | `public.sync_settings_cache` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 153 | `public.tenant_matches_jwt` | `public, pg_temp` | auth.uid+tenant | GRANT EXECUTE; REVOKE EXECUTE |
| 154 | `public.terminate_sessions_on_status_change` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 155 | `public.terminate_user_sessions` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; GRANT EXECUTE; REVOKE EXECUTE |
| 156 | `public.trg_audit_feature_flag_change` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 157 | `public.trg_audit_lesson_state_change` | `public, pg_temp` | auth.uid | no explicit grant lines |
| 158 | `public.trg_cascade_course_soft_delete` | `public, pg_temp` | - | no explicit grant lines |
| 159 | `public.trg_cascade_section_deletes` | `public, pg_temp` | - | no explicit grant lines |
| 160 | `public.trg_enforce_permission_scope` | `public, pg_temp` | tenant | no explicit grant lines |
| 161 | `public.trg_enforce_single_active_session` | `public, pg_temp` | tenant | no explicit grant lines |
| 162 | `public.trg_hash_chain_activity_logs` | `'public, pg_catalog, extensions'` | tenant | no explicit grant lines |
| 163 | `public.trg_increment_token_version_on_role_change` | `public, pg_temp` | - | no explicit grant lines |
| 164 | `public.trg_invalidate_perm_cache_on_role_permissions` | `public, pg_temp` | tenant | no explicit grant lines |
| 165 | `public.trg_invalidate_user_validity_cache` | `public, pg_temp` | - | no explicit grant lines |
| 166 | `public.trg_lessons_publish_notify` | `public, pg_temp` | - | no explicit grant lines |
| 167 | `public.trg_log_pii_access` | `public, pg_temp` | auth.uid | no explicit grant lines |
| 168 | `public.trg_prevent_prerequisite_cycles` | `public, pg_temp` | - | no explicit grant lines |
| 169 | `public.trg_rebuild_perm_cache` | `public, pg_temp` | tenant | no explicit grant lines |
| 170 | `public.trg_refresh_enrollment_totals_stmt` | `public, pg_temp` | - | no explicit grant lines |
| 171 | `public.trg_refresh_user_validity` | `public, pg_temp` | tenant | REVOKE EXECUTE; REVOKE EXECUTE |
| 172 | `public.trg_schedule_mv_refresh` | `public, pg_temp` | - | REVOKE EXECUTE; REVOKE EXECUTE |
| 173 | `public.trg_sync_user_roles` | `public, pg_temp` | tenant | REVOKE EXECUTE; REVOKE EXECUTE |
| 174 | `public.trg_touch_feature_flag_row` | `public, pg_temp` | auth.uid | no explicit grant lines |
| 175 | `public.trg_trim_notification_fields` | `public, pg_temp` | - | REVOKE EXECUTE; REVOKE EXECUTE |
| 176 | `public.trg_update_enrollment_progress` | `public, pg_temp` | - | REVOKE EXECUTE; REVOKE EXECUTE |
| 177 | `public.trg_users_email_hardening` | `''` | - | REVOKE EXECUTE; REVOKE EXECUTE |
| 178 | `public.trg_validate_enrollments_tenant_match` | `public, pg_temp` | tenant | REVOKE EXECUTE; REVOKE EXECUTE |
| 179 | `public.unlock_app` | `public, pg_temp` | - | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 180 | `public.update_lesson_progress` | `public, pg_temp` | auth.uid+tenant+perm+perm | GRANT EXECUTE; REVOKE EXECUTE |
| 181 | `public.update_updated_at` | `public, pg_temp` | - | no explicit grant lines |
| 182 | `public.user_has_permission` | `public, pg_temp` | auth.uid+tenant | no explicit grant lines |
| 183 | `public.validate_user_session` | `public, pg_temp` | auth.uid | GRANT EXECUTE; REVOKE EXECUTE |
| 184 | `public.verify_audit_chain` | `''` | perm+perm | no explicit grant lines |
| 185 | `public.worker_control_user_account` | `public, pg_temp` | tenant+perm+perm | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 186 | `public.worker_fail_bulk_job` | `public, pg_temp` | - | no explicit grant lines |
| 187 | `public.worker_issue_warning` | `public, pg_temp` | auth.uid+tenant+perm+perm | no explicit grant lines |
| 188 | `public.worker_reset_user_device` | `public, pg_temp` | tenant+perm+perm | no explicit grant lines |
| 189 | `public.worker_terminate_user_sessions` | `public, pg_temp` | tenant+perm+perm | GRANT EXECUTE; REVOKE EXECUTE; REVOKE EXECUTE |
| 190 | `public.worker_update_bulk_job` | `public, pg_temp` | - | no explicit grant lines |

## Verdicts
- Functions with NO search_path: **0** (verified by parser).
- Functions with empty search_path: 16, all using fully-qualified refs (auth./public./pg_catalog.) — safe pattern.
- Standard pattern `public, pg_temp`: tenant RLS helpers + RPCs; pg_temp is session-private.
- Each privileged RPC still requires per-function review of grants + negative tests (SEC-1 covers extend_enrollment; extend matrix to others in P1).
