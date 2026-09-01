'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm, Controller, type Resolver } from 'react-hook-form';

import { useCreateCourse } from '@/adapters/mutations/courses.mutations';
import { useAuthUser } from '@/adapters/stores/auth.store';
import { useToast } from '@/adapters/stores/toast.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Modal } from '@/components/ui/Modal';
import { Select, SelectItem } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { createCourseSchema, type CreateCourseFormInput } from '@/domain/schemas/course.schema';
import type { CreateCourseInput } from '@/domain/types/course.types';

interface CreateCourseDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateCourseDialog({ open, onClose }: CreateCourseDialogProps) {
  const t = useTranslations('common');
  const createMutation = useCreateCourse();
  const { showToast } = useToast();
  const user = useAuthUser();

  const levelOptions = [
    { value: 'beginner', label: t('beginner') },
    { value: 'intermediate', label: t('intermediate') },
    { value: 'advanced', label: t('advanced') },
  ];

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateCourseFormInput>({
    resolver: zodResolver(createCourseSchema) as Resolver<CreateCourseFormInput>,
    defaultValues: {
      title: '',
      description: '',
      category: '',
      level: 'beginner',
      is_free: true,
      price: 0,
      slug: '',
      thumbnail_url: '',
      teacher_id: user?.id || '',
    } satisfies CreateCourseFormInput,
  });

  const isFree = watch('is_free');

  const onSubmit = async (data: CreateCourseFormInput) => {
    try {
      const payload: CreateCourseInput = {
        title: data.title,
        level: data.level,
        price: data.is_free ? 0 : data.price,
      };
      if (data.description) payload.description = data.description;
      if (data.category) payload.category = data.category;
      if (data.slug) payload.slug = data.slug;
      if (data.thumbnail_url) payload.thumbnail_url = data.thumbnail_url;
      if (data.teacher_id) payload.teacher_id = data.teacher_id;

      await createMutation.mutateAsync(payload);
      showToast(t('course_created_success'), 'success');
      reset();
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('failed_to_create'), 'error');
    }
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('create_new_course')}
      maxWidth="md"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={createMutation.isPending}
            className="font-semibold text-muted-foreground"
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="create-course-form"
            disabled={createMutation.isPending}
            className="min-w-[120px]"
          >
            {createMutation.isPending ? t('creating') : t('create_course')}
          </Button>
        </>
      }
    >
      <form id="create-course-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">{t('course_title_label')}</Label>
          <Input
            id="title"
            placeholder={t('course_title_placeholder')}
            {...register('title')}
            className={errors.title ? 'border-destructive' : ''}
          />
          {errors.title && (
            <p className="text-xs text-destructive font-medium">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t('description_label')}</Label>
          <textarea
            id="description"
            rows={3}
            className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-faang"
            placeholder={t('description_placeholder')}
            {...register('description')}
          />
          {errors.description && (
            <p className="text-xs text-destructive font-medium">{errors.description.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="thumbnail_url">{t('thumbnail_url_label')}</Label>
          <Input
            id="thumbnail_url"
            placeholder={t('thumbnail_url_placeholder')}
            {...register('thumbnail_url')}
            className={errors.thumbnail_url ? 'border-destructive' : ''}
          />
          {errors.thumbnail_url && (
            <p className="text-xs text-destructive font-medium">{errors.thumbnail_url.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="category">{t('category_label')}</Label>
            <Input
              id="category"
              placeholder={t('category_placeholder')}
              {...register('category')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('difficulty_level')}</Label>
            <Controller
              name="level"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  {levelOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </Select>
              )}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-base">{t('free_course_label')}</Label>
            <p className="text-xs text-muted-foreground font-medium">{t('free_course_desc')}</p>
          </div>
          <Controller
            name="is_free"
            control={control}
            render={({ field }) => (
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>

        {!isFree && (
          <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
            <Label htmlFor="price">{t('price_usd')}</Label>
            <Input
              id="price"
              type="number"
              step="1"
              min="0"
              placeholder="0"
              {...register('price', { valueAsNumber: true })}
            />
            {errors.price && (
              <p className="text-xs text-destructive font-medium">{errors.price.message}</p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
