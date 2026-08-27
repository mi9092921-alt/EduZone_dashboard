/** RPC error codes from the database error catalogue — synced with v13.9.0 */
export type RpcErrorCode =
  | 'ADMIN_ONLY'
  | 'INVALID_ACTION'
  | 'RPC_TIMEOUT'
  | 'DB_ERROR'
  | 'USER_NOT_FOUND'
  | 'NO_DEVICES'
  | 'PERMISSION_DENIED'
  | 'AUTO_SUSPEND'
  | 'DUPLICATE'
  | 'COURSE_NOT_FOUND'
  | 'ALREADY_REVOKED'
  | 'NOT_FOUND'
  | 'SETTING_NOT_FOUND'
  | 'INVALID_TYPE'
  | 'ENDS_AT_PAST'
  | 'LOCK_CONTENTION'
  | 'NO_JOBS'
  | 'AUTH_REQUIRED'
  | 'INVALID_DEVICE_ID'
  | 'DEVICE_ALREADY_BOUND'
  | 'MAX_DEVICES_REACHED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_FILTERS'
  | 'JOB_QUEUE_FULL'
  | 'PARTIAL_FAILURE'
  | 'JOB_TIMED_OUT'
  | 'DRY_RUN_ZERO'
  | 'NO_PUBLISHED_SECTIONS'
  | 'STUDENT_NOT_ENROLLED'
  | 'EMPTY_RESULT'
  // v13: New error codes
  | 'INVALID_COORDINATES'
  | 'INVALID_LATITUDE'
  | 'INVALID_LONGITUDE'
  | 'INVALID_ACCURACY'
  | 'INVALID_SOURCE'
  | 'TENANT_MISMATCH'
  | 'UNKNOWN';

/** Typed RPC error */
export interface RpcError {
  code: RpcErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/** Check user access result from RPC */
export interface CheckUserAccessResult {
  allowed: boolean;
  reason?:
    | 'app_locked'
    | 'unauthenticated'
    | 'account_banned'
    | 'account_locked'
    | 'account_suspended'
    | 'user_not_found'
    | 'maintenance_mode';
  message?: string;
  role?: string;
  tenant_id?: string;
  until?: string;
  maintenance_bypass?: boolean;
}

/** Account action type for control_user_account RPC */
export type AccountAction = 'lock' | 'unlock' | 'suspend' | 'ban';

/** Control user account result — v13: now includes jsonb response from RPC */
export interface ControlResult {
  success: boolean;
  message?: string;
  auto_suspended?: boolean;
  /** v13: Fields from the jsonb RPC response */
  action?: AccountAction;
  user_id?: string;
  previous_status?: string;
  new_status?: string;
  status?: string;
  until?: string | null;
}
