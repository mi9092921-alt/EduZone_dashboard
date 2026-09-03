import type { ICourseAdminRepository } from '@/application/ports/ICourseAdminRepository';
import { deleteCourse, getCourseTenantId } from '@/infrastructure/repos/courses.service';

/**
 * Supabase implementation of ICourseAdminRepository.
 *
 * Thin adapter over the existing `courses.service.ts` functions — no new
 * SQL, no new privileged client. This just gives the privileged
 * (service-role, RLS-bypassing) course operations a typed port so the
 * use case above can be unit-tested without touching Supabase, exactly
 * like `user-admin.repository.ts` does for users.
 */
export function makeCourseAdminRepository(): ICourseAdminRepository {
  return {
    getCourseTenantId,
    deleteCourse,
  };
}
