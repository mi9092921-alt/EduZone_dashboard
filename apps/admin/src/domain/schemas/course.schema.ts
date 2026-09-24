import { z } from 'zod';

/**
 * Zod schemas for course management actions.
 * Mirror the DB CHECK constraints from Eduzone Schema v5.
 */

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);
export const courseLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const createCourseBaseSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(5000).nullish(),
  category: z.string().max(100).nullish(),
  level: courseLevelSchema.optional().default('beginner'),
  status: courseStatusSchema.optional().default('draft'),
  is_discoverable: z.boolean().optional().default(true),
  is_free: z.boolean().default(true),
  price: z
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price cannot be negative')
    .optional()
    .default(0),
  // NULLABLE-ALIGNMENT (2026-09-25): courses.slug and courses.thumbnail_url
  // are nullable text columns in the DB (03_tables.sql), and form payloads
  // can carry an explicit null (react-hook-form defaultValues sourced from a
  // row where the column is NULL). The previous `.optional().or(z.literal(''))
  // // shape rejected null with an invalid_union ZodError. `.nullish()` accepts
  // string | null | undefined, and the transform normalizes '' to null —
  // matching the DB CHECK (slug IS NULL OR length(btrim(slug)) > 0) which
  // rejects the empty string but allows NULL.
  slug: z
    .string()
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be URL-friendly (lowercase, hyphens only)')
    .or(z.literal(''))
    .nullish()
    .transform((v) => (v ? v : null)),
  teacher_id: z.string().uuid().nullish(),
  thumbnail_url: z
    .string()
    .url('Invalid image URL format')
    .regex(
      /\.(jpg|jpeg|png|webp|avif|gif|svg|bmp)(\?.*)?$/i,
      'Must be a valid image URL (jpg, png, etc.)',
    )
    .or(z.literal(''))
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const createCourseSchema = createCourseBaseSchema.refine(
  (data) => data.is_free || (data.price && data.price > 0),
  {
    message: 'Price must be greater than 0 for paid courses',
    path: ['price'],
  },
);
export type CreateCourseFormInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseBaseSchema.partial().extend({
  status: courseStatusSchema.optional(),
});
export type UpdateCourseFormInput = z.infer<typeof updateCourseSchema>;

export const sectionSchema = z.object({
  title: z
    .string()
    .min(2, 'Section title is required')
    .max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(2000).optional(),
  order_index: z.number().int().min(0).optional(),
  is_published: z.boolean().default(false),
});
export type SectionFormInput = z.infer<typeof sectionSchema>;

export const lessonSchema = z.object({
  title: z
    .string()
    .min(2, 'Lesson title is required')
    .max(200, 'Title cannot exceed 200 characters'),
  video_url: z
    .string()
    .url('Invalid URL format')
    .regex(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.*$/, 'Must be a valid YouTube URL'),
  order_index: z.number().int().min(0).optional(),
  is_published: z.boolean().default(true),
  duration_sec: z
    .number({ invalid_type_error: 'Duration must be a number' })
    .int()
    .min(0)
    .optional(),
  is_preview: z.boolean().default(false),
});
export type LessonFormInput = z.infer<typeof lessonSchema>;

export const enrollStudentSchema = z.object({
  user_id: z.string().uuid('Select a student'),
  course_id: z.string().uuid('Select a course'),
  expires_at: z.string().optional(),
});
export type EnrollStudentFormInput = z.infer<typeof enrollStudentSchema>;

export const revokeEnrollmentSchema = z.object({
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
});
export type RevokeEnrollmentFormInput = z.infer<typeof revokeEnrollmentSchema>;

export const extendEnrollmentSchema = z.object({
  new_expires_at: z
    .string()
    .min(1, 'Expiration date is required')
    .refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime()) && date.getTime() > Date.now();
    }, 'New expiration date must be in the future'),
});
export type ExtendEnrollmentFormInput = z.infer<typeof extendEnrollmentSchema>;

export const deleteCourseSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm deletion' }),
  }),
});
export type DeleteCourseFormInput = z.infer<typeof deleteCourseSchema>;
