import type { Meta, StoryObj } from '@storybook/react';
import { CourseInfoForm } from './CourseInfoForm';
import { http, HttpResponse, delay } from 'msw';
import { within, userEvent, expect, waitFor } from '@storybook/test';
import type { CourseDetail } from '@/domain/types/course.types';

const mockCourse: any = {
  id: 'c1',
  title: 'React Fundamentals',
  slug: 'react-fundamentals',
  description: 'Learn the basics of React.',
  category: 'Development',
  level: 'beginner',
  status: 'published',
  price: 0,
  is_free: true,
  thumbnail_url: null,
  teacher_id: 't1',
  teacher_name: 'Sarah Drasner',
  tenant_id: 'ten1',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

const meta: Meta<typeof CourseInfoForm> = {
  title: 'Courses/CourseInfoForm',
  component: CourseInfoForm,
  tags: ['autodocs'],
  args: {
    course: mockCourse as CourseDetail,
  },
  parameters: {
    msw: {
      handlers: [
        http.get('*/rpc/get_users', () => {
          return HttpResponse.json({
            data: [
              {
                id: 't1',
                email: 'sarah@example.com',
                first_name: 'Sarah',
                last_name: 'Drasner',
                primary_role: 'teacher',
              },
            ],
            count: 1,
            error: null,
          });
        }),
        http.post('*/rpc/update_course', async ({ request }) => {
          await delay(1000);
          return HttpResponse.json({ data: true, error: null });
        }),
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof CourseInfoForm>;

export const Default: Story = {};

export const SuccessfulSubmission: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Change title', async () => {
      const titleInput = canvas.getByLabelText(/Course Title/i);
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, 'Updated React Fundamentals');
    });

    await step('Change category', async () => {
      const categoryInput = canvas.getByLabelText(/Category/i);
      await userEvent.clear(categoryInput);
      await userEvent.type(categoryInput, 'Web Dev');
    });

    await step('Submit form', async () => {
      const submitButton = canvas.getByRole('button', { name: /Save Changes/i });
      await userEvent.click(submitButton);
    });

    await step('Verify success message', async () => {
      await waitFor(
        () => {
          expect(canvas.getByText(/Course updated successfully/i)).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });
  },
};

export const ValidationError: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Clear title', async () => {
      const titleInput = canvas.getByLabelText(/Course Title/i);
      await userEvent.clear(titleInput);
    });

    await step('Submit form', async () => {
      const submitButton = canvas.getByRole('button', { name: /Save Changes/i });
      await userEvent.click(submitButton);
    });

    await step('Verify validation error', async () => {
      await waitFor(() => {
        expect(canvas.getByText(/Required/i)).toBeInTheDocument();
      });
    });
  },
};
