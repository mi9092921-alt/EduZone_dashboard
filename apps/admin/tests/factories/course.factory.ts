import type { Course, Enrollment, Section, Lesson } from '@/domain/types/course.types';
import type { CourseStatus, EnrollmentStatus } from '@/domain/types/course.types';

// ── Shared seeds ─────────────────────────────────────────────────
const MOCK_TENANT_ID  = '00000000-0000-0000-0000-000000000001';
const MOCK_REGION_ID  = 'region-eg-01';
const MOCK_TEACHER_ID = '00000000-0000-0000-0000-000000000010';

let _courseCounter = 100;
let _sectionCounter = 200;
let _lessonCounter = 300;
let _enrollmentCounter = 400;

function nextCourseId():     string { return `course-${String(_courseCounter++).padStart(4, '0')}`; }
function nextSectionId():    string { return `section-${String(_sectionCounter++).padStart(4, '0')}`; }
function nextLessonId():     string { return `lesson-${String(_lessonCounter++).padStart(4, '0')}`; }
function nextEnrollmentId(): string { return `enroll-${String(_enrollmentCounter++).padStart(4, '0')}`; }
function isoNow():           string { return new Date().toISOString(); }

// ── Course factory ────────────────────────────────────────────────
export const courseFactory = {
  build(overrides: Partial<Course> = {}): Course {
    const id = nextCourseId();
    const base: Course = {
      id,
      tenant_id:        MOCK_TENANT_ID,
      title:            `Test Course ${id}`,
      description:      'A test course description',
      status:           'published' as CourseStatus,
      thumbnail_url:    null,
      slug:             `test-course-${id}`,
      teacher_id:       MOCK_TEACHER_ID,
      category:         'Programming',
      level:            'beginner',
      price:            0,
      is_free:          true,
      region_id:        MOCK_REGION_ID,
      created_at:       isoNow(),
      updated_at:       isoNow(),
      deleted_at:       null,
      teacher_name:     'Test Teacher',
      enrollment_count: 0,
    };
    return { ...base, ...overrides };
  },

  buildList(n: number, overrides: Partial<Course> = {}): Course[] {
    return Array.from({ length: n }, () => courseFactory.build(overrides));
  },

  draft(overrides: Partial<Course> = {}): Course {
    return courseFactory.build({ status: 'draft', ...overrides });
  },

  archived(overrides: Partial<Course> = {}): Course {
    return courseFactory.build({ status: 'archived', ...overrides });
  },
};

// ── Section factory ───────────────────────────────────────────────
export const sectionFactory = {
  build(courseId: string, overrides: Partial<Section> = {}): Section {
    const id = nextSectionId();
    const base: Section = {
      id,
      course_id:   courseId,
      tenant_id:   MOCK_TENANT_ID,
      title:       `Section ${id}`,
      description: null,
      order_index: 1,
      is_published: true,
      created_at:  isoNow(),
      updated_at:  isoNow(),
      deleted_at:  null,
      lessons:     [],
    };
    return { ...base, ...overrides };
  },
};

// ── Lesson factory ────────────────────────────────────────────────
export const lessonFactory = {
  build(sectionId: string, overrides: Partial<Lesson> = {}): Lesson {
    const id = nextLessonId();
    const base: Lesson = {
      id,
      section_id:   sectionId,
      course_id:    'course-100',
      tenant_id:    MOCK_TENANT_ID,
      title:        `Lesson ${id}`,
      order_index:  1,
      is_published: true,
      is_preview:   false,
      duration_sec: 600,
      created_at:   isoNow(),
      updated_at:   isoNow(),
      deleted_at:   null,
    };
    return { ...base, ...overrides };
  },
};

// ── Enrollment factory ────────────────────────────────────────────
export const enrollmentFactory = {
  build(userId: string, courseId: string, overrides: Partial<Enrollment> = {}): Enrollment {
    const id = nextEnrollmentId();
    const base: Enrollment = {
      id,
      user_id:        userId,
      course_id:      courseId,
      tenant_id:      MOCK_TENANT_ID,
      enrolled_by:    null,
      status:         'active' as EnrollmentStatus,
      enrolled_at:    isoNow(),
      expires_at:     null,
      completed_at:   null,
      revoked_at:     null,
      revoked_by:     null,
      revoke_reason:  null,
      progress_pct:   0,
      total_lessons:  null,
      completed_lessons: null,
      last_watched_at: null,
    };
    return { ...base, ...overrides };
  },

  revoked(userId: string, courseId: string, overrides: Partial<Enrollment> = {}): Enrollment {
    return enrollmentFactory.build(userId, courseId, {
      status:       'revoked',
      revoked_at:   isoNow(),
      revoke_reason:'Policy violation',
      ...overrides,
    });
  },
};
