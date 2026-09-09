import { describe, it, expect } from 'vitest';

import { createCourseSchema, sectionSchema, lessonSchema, enrollStudentSchema, revokeEnrollmentSchema } from './course.schema';

describe('course domain schemas', () => {
  it('validates createCourseSchema - paid course needs price', () => {
    expect(
      createCourseSchema.safeParse({
        title: 'Course',
        is_free: false,
        price: 0,
      }).success,
    ).toBe(false);

    expect(
      createCourseSchema.safeParse({
        title: 'Course',
        is_free: false,
        price: 10,
      }).success,
    ).toBe(true);

    expect(
      createCourseSchema.safeParse({
        title: 'Course',
        is_free: true,
        price: 0,
      }).success,
    ).toBe(true);
  });

  it('validates sectionSchema', () => {
    expect(sectionSchema.safeParse({ title: 'A' }).success).toBe(false);
    expect(sectionSchema.safeParse({ title: 'Section 1' }).success).toBe(true);
  });

  it('validates lessonSchema', () => {
    expect(
      lessonSchema.safeParse({
        title: 'Lesson 1',
        video_url: 'invalid',
      }).success,
    ).toBe(false);

    expect(
      lessonSchema.safeParse({
        title: 'Lesson 1',
        video_url: 'https://youtube.com/watch?v=123',
      }).success,
    ).toBe(true);
  });

  // Enrollment flow schemas (cypress/e2e/courses/enroll-student.cy.ts and
  // revoke-enrollment.cy.ts ports): the enroll/revoke dialogs are validated
  // client-side by these before any RPC fires.
  it('validates enrollStudentSchema - a real student selection is required', () => {
    const course_id = 'cccccccc-0000-0000-0000-000000000003';

    // Empty (dialog submitted without picking from the autocomplete).
    expect(enrollStudentSchema.safeParse({ user_id: '', course_id }).success).toBe(false);

    // Non-uuid is rejected -- user_id must come from a real option id.
    expect(enrollStudentSchema.safeParse({ user_id: 'not-a-uuid', course_id }).success).toBe(false);

    expect(
      enrollStudentSchema.safeParse({
        user_id: 'aaaaaaaa-0000-0000-0000-000000000005',
        course_id,
      }).success,
    ).toBe(true);
  });

  it('validates revokeEnrollmentSchema - reason length bounds', () => {
    // RevokeEnrollmentDialog requires a meaningful reason (min 5).
    expect(revokeEnrollmentSchema.safeParse({ reason: 'abc' }).success).toBe(false);

    expect(revokeEnrollmentSchema.safeParse({ reason: 'E2E cleanup after enroll-port check' }).success).toBe(
      true,
    );

    expect(revokeEnrollmentSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });
});
