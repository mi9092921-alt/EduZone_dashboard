'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Add, Close, ImportContacts, PlaylistAddCheck } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';

import {
  useCreateCourse,
  useSaveLearningObjectives,
  useSavePrerequisites,
} from '@/adapters/mutations/courses.mutations';
import { useCourses } from '@/adapters/queries/courses.queries';
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
  const saveObjectivesMutation = useSaveLearningObjectives();
  const savePrerequisitesMutation = useSavePrerequisites();
  const { showToast } = useToast();
  const user = useAuthUser();

  // Prerequisite options: all tenant-visible courses (RLS-scoped). No
  // self-exclusion needed — the course doesn't exist yet at selection time.
  const { data: coursesData } = useCourses({}, 1, 100);
  const prerequisiteOptions = coursesData?.data ?? [];

  const [objectives, setObjectives] = useState<string[]>([]);
  const [prereqIds, setPrereqIds] = useState<string[]>([]);

  const handleAddObjective = () => {
    setObjectives([...objectives, '']);
  };

  const handleObjectiveChange = (index: number, value: string) => {
    const updated = [...objectives];
    updated[index] = value;
    setObjectives(updated);
  };

  const handleRemoveObjective = (index: number) => {
    setObjectives(objectives.filter((_, i) => i !== index));
  };

  const handleAddPrereq = (id: string) => {
    if (id && !prereqIds.includes(id)) {
      setPrereqIds([...prereqIds, id]);
    }
  };

  const handleRemovePrereq = (id: string) => {
    setPrereqIds(prereqIds.filter((x) => x !== id));
  };

  const availableOptions = prerequisiteOptions.filter((c) => !prereqIds.includes(c.id));

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
      status: 'draft',
      is_discoverable: true,
      is_free: true,
      price: 0,
      slug: '',
      thumbnail_url: '',
      teacher_id: user?.id || '',
    } satisfies CreateCourseFormInput,
  });

  const isFree = watch('is_free');

  const isPending =
    createMutation.isPending ||
    saveObjectivesMutation.isPending ||
    savePrerequisitesMutation.isPending;

  const resetAll = () => {
    reset();
    setObjectives([]);
    setPrereqIds([]);
  };

  const onSubmit = async (data: CreateCourseFormInput) => {
    try {
      const payload: CreateCourseInput = {
        title: data.title,
        level: data.level,
        price: data.is_free ? 0 : data.price,
        is_discoverable: data.is_discoverable ?? true,
      };
      if (data.description) payload.description = data.description;
      if (data.category) payload.category = data.category;
      if (data.status) payload.status = data.status;
      if (data.slug) payload.slug = data.slug;
      if (data.thumbnail_url) payload.thumbnail_url = data.thumbnail_url;
      if (data.teacher_id) payload.teacher_id = data.teacher_id;

      const created = await createMutation.mutateAsync(payload);

      const cleanObjectives = objectives.map((o) => o.trim()).filter(Boolean);
      if (cleanObjectives.length > 0) {
        await saveObjectivesMutation.mutateAsync({
          courseId: created.id,
          objectives: cleanObjectives,
        });
      }
      if (prereqIds.length > 0) {
        await savePrerequisitesMutation.mutateAsync({
          courseId: created.id,
          prerequisiteCourseIds: prereqIds,
          tenantId: created.tenant_id ?? user?.tenant_id ?? '',
        });
      }

      showToast(t('course_created_success'), 'success');
      resetAll();
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('failed_to_create'), 'error');
    }
  };

  const handleClose = () => {
    if (!isPending) {
      resetAll();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('create_new_course')}
      maxWidth="lg"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isPending}
            className="font-semibold text-muted-foreground"
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="create-course-form"
            disabled={isPending}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>{t('course_status')}</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectItem value="draft">{t('draft_status')}</SelectItem>
                  <SelectItem value="published">{t('published_status')}</SelectItem>
                  <SelectItem value="archived">{t('archived_status')}</SelectItem>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">{t('url_slug')}</Label>
            <Input
              id="slug"
              placeholder="advanced-react-patterns"
              {...register('slug')}
              className={errors.slug ? 'border-destructive' : ''}
            />
            {errors.slug ? (
              <p className="text-xs text-destructive font-medium">{errors.slug.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground font-medium italic">
                {t('url_slug_helper')}
              </p>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-base">{t('discoverable_label')}</Label>
            <p className="text-xs text-muted-foreground font-medium">{t('discoverable_desc')}</p>
          </div>
          <Controller
            name="is_discoverable"
            control={control}
            render={({ field }) => (
              <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
            )}
          />
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

        {/* Course Prerequisites Section */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <div className="space-y-1">
            <Label className="text-base font-bold flex items-center gap-2 text-foreground">
              <PlaylistAddCheck className="h-5 w-5 text-primary" />
              {t('course_prerequisites')}
            </Label>
            <p className="text-xs text-muted-foreground font-medium">
              {t('course_prerequisites_desc')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {prereqIds.length === 0 ? (
              <p className="text-sm text-muted-foreground italic font-medium">
                {t('no_prerequisites')}
              </p>
            ) : (
              prereqIds.map((id) => {
                const match = prerequisiteOptions.find((c) => c.id === id);
                const title = match?.title || id;
                const level = match?.level;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:bg-primary/20"
                  >
                    <span>
                      {title} {level ? `(${level})` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePrereq(id)}
                      className="text-primary/70 hover:text-primary transition-colors focus:outline-none"
                    >
                      <Close className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {availableOptions.length > 0 && (
            <div className="w-full space-y-2">
              <Label
                htmlFor="add-prereq-select"
                className="text-xs font-semibold text-muted-foreground"
              >
                {t('select_prerequisites')}
              </Label>
              <Select id="add-prereq-select" value="" onValueChange={handleAddPrereq}>
                <SelectItem value="" disabled>
                  {t('select_prerequisites')}
                </SelectItem>
                {availableOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title} ({c.level})
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* Learning Objectives Section */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <div className="space-y-1">
            <Label className="text-base font-bold flex items-center gap-2 text-foreground">
              <ImportContacts className="h-5 w-5 text-primary" />
              {t('learning_objectives')}
            </Label>
            <p className="text-xs text-muted-foreground font-medium">
              {t('learning_objectives_desc')}
            </p>
          </div>

          <div className="space-y-3">
            {objectives.map((obj, index) => (
              <div key={index} className="flex gap-2 items-center animate-in fade-in duration-200">
                <span className="text-xs font-bold text-muted-foreground bg-muted h-8 w-8 rounded-full flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <Input
                  value={obj}
                  onChange={(e) => handleObjectiveChange(index, e.target.value)}
                  placeholder={t('objective_placeholder')}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleRemoveObjective(index)}
                  className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                >
                  <Close className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={handleAddObjective}
              className="w-full sm:w-auto mt-2 font-bold uppercase tracking-wider text-xs"
            >
              <Add className="me-2 h-4 w-4" />
              {t('add_objective')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
