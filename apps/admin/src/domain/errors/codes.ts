/** All known RPC error codes from the EduZone API */
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
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

/** Session-invalidating error codes that require hard logout */
export const SESSION_INVALIDATING_CODES: ReadonlySet<string> = new Set([
  'AUTH_REQUIRED',
  'account_locked',
  'account_suspended',
  'account_banned',
  'user_not_found',
]);
