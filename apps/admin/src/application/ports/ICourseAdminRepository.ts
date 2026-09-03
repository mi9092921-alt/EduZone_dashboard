/**
 * Port — course lifecycle operations that require elevated (service-role)
 * privileges, i.e. operations that intentionally bypass Row Level Security
 * and therefore MUST be authorized in application code before use.
 *
 * `deleteCourse` bypasses RLS via the service-role client (soft-delete of
 * a course, regardless of tenant), so the caller MUST resolve
 * `getCourseTenantId` and assert same-tenant access (or super_admin) at
 * the action boundary before ever calling `deleteCourse`.
 */
export interface ICourseAdminRepository {
  /**
   * Looks up the owning tenant_id for a course. Returns null when the
   * course does not exist — callers must treat `null` as "deny", never
   * as "allow" (fail closed).
   */
  getCourseTenantId(courseId: string): Promise<string | null>;

  /** Soft-deletes a course (sets deleted_at) via the service-role client. */
  deleteCourse(courseId: string): Promise<void>;
}
