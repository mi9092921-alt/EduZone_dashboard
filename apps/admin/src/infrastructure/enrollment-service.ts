import { container } from '@/container';

/**
 * Enrollment Service
 * 
 * Handles course enrollments for both students (self-enroll) and admins (manual enroll).
 * Strictly follows the RLS-first contract by using RPC wrappers for mutations.
 */

export interface EnrollmentResult {
  id?: string;
  success: boolean;
  error?: string;
}

/**
 * Enrolls the CURRENT authenticated user into a course.
 * 
 * @param courseId UUID of the course
 * @returns EnrollmentResult containing the enrollment ID or error
 */
export async function enrollInCourse(courseId: string): Promise<EnrollmentResult> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('enroll_in_course', {
    p_course_id: courseId
  });

  if (error) {
    console.error('Failed self-enrollment:', error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data as string };
}

/**
 * Enrolls a student into a course (Admin action).
 * 
 * @param userId UUID of the student to enroll
 * @param courseId UUID of the course
 * @param expiresAt Optional expiration date
 * @returns EnrollmentResult
 */
export async function enrollStudent(
  userId: string,
  courseId: string,
  expiresAt?: string
): Promise<EnrollmentResult> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('enroll_student', {
    p_user_id: userId,
    p_course_id: courseId,
    p_expires_at: expiresAt || null
  });

  if (error) {
    console.error('Failed admin enrollment:', error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data as string };
}
