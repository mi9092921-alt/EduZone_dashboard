import { describe, it, expect } from 'vitest';
import {
  createCourseSchema,
  sectionSchema,
  lessonSchema,
} from './course.schema';

describe('course domain schemas', () => {
  it('validates createCourseSchema - paid course needs price', () => {
    expect(createCourseSchema.safeParse({
      title: 'Course',
      is_free: false,
      price: 0
    }).success).toBe(false);

    expect(createCourseSchema.safeParse({
      title: 'Course',
      is_free: false,
      price: 10
    }).success).toBe(true);

    expect(createCourseSchema.safeParse({
      title: 'Course',
      is_free: true,
      price: 0
    }).success).toBe(true);
  });

  it('validates sectionSchema', () => {
    expect(sectionSchema.safeParse({ title: 'A' }).success).toBe(false);
    expect(sectionSchema.safeParse({ title: 'Section 1' }).success).toBe(true);
  });

  it('validates lessonSchema', () => {
    expect(lessonSchema.safeParse({
      title: 'Lesson 1',
      video_url: 'invalid'
    }).success).toBe(false);
    
    expect(lessonSchema.safeParse({
      title: 'Lesson 1',
      video_url: 'https://youtube.com/watch?v=123'
    }).success).toBe(true);
  });
});
