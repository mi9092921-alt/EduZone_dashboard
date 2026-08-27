import type { Meta, StoryObj } from '@storybook/react';
import { CoursesTable } from './CoursesTable';
import { fn } from '@storybook/test';
import type { Course } from '@/domain/types/course.types';

const mockCourses: any[] = [
  {
    id: '1',
    title: 'Advanced React Patterns',
    slug: 'advanced-react-patterns',
    description: 'Master advanced React patterns and techniques.',
    category: 'Development',
    level: 'advanced',
    status: 'published',
    price: 99,
    is_free: false,
    thumbnail_url: null,
    teacher_id: 't1',
    teacher_name: 'Dr. Sarah Smith',
    tenant_id: 'ten1',
    created_at: '2023-05-01T10:00:00Z',
    updated_at: '2023-05-01T10:00:00Z',
  },
  {
    id: '2',
    title: 'Beginner Web Development',
    slug: 'beginner-web-dev',
    description: 'Start your journey into web development.',
    category: 'Development',
    level: 'beginner',
    status: 'draft',
    price: 0,
    is_free: true,
    thumbnail_url: null,
    teacher_id: 't2',
    teacher_name: 'John Doe',
    tenant_id: 'ten1',
    created_at: '2023-06-15T14:30:00Z',
    updated_at: '2023-06-15T14:30:00Z',
  },
  {
    id: '3',
    title: 'Intermediate UI/UX Design',
    slug: 'intermediate-ui-ux',
    description: 'Elevate your design skills.',
    category: 'Design',
    level: 'intermediate',
    status: 'archived',
    price: 49,
    is_free: false,
    thumbnail_url: null,
    teacher_id: 't1',
    teacher_name: 'Dr. Sarah Smith',
    tenant_id: 'ten1',
    created_at: '2023-07-20T09:15:00Z',
    updated_at: '2023-07-20T09:15:00Z',
  },
];

const meta: Meta<typeof CoursesTable> = {
  title: 'Courses/CoursesTable',
  component: CoursesTable,
  tags: ['autodocs'],
  args: {
    courses: mockCourses as Course[],
    isLoading: false,
    page: 1,
    pageSize: 10,
    totalCount: 3,
    onPageChange: fn(),
    onPageSizeChange: fn(),
    onViewCourse: fn(),
    onEditCourse: fn(),
    onPublishCourse: fn(),
    onArchiveCourse: fn(),
    onDeleteCourse: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof CoursesTable>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    courses: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    courses: [],
    totalCount: 0,
  },
};
