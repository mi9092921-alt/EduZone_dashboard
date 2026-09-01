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
  description: z.string().max(5000).optional().or(z.literal('')),
  category: z.string().max(100).optional().or(z.literal('')),
  level: courseLevelSchema.optional().default('beginner'),
  is_free: z.boolean().default(true),
  price: z
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price cannot be negative')
    .optional()
    .default(0),
  slug: z
    .string()
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be URL-friendly (lowercase, hyphens only)')
    .optional()
    .or(z.literal('')),
  teacher_id: z.string().uuid().optional(),
  thumbnail_url: z
    .string()
    .url('Invalid image URL format')
    .regex(
      /\.(jpg|jpeg|png|webp|avif|gif|svg|bmp)(\?.*)?$/i,
      'Must be a valid image URL (jpg, png, etc.)',
    )
    .optional()
    .or(z.literal('')),
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

export const deleteCourseSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm deletion' }),
  }),
});
export type DeleteCourseFormInput = z.infer<typeof deleteCourseSchema>;
