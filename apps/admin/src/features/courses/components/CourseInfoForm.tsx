'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save, DeleteOutline } from '@mui/icons-material';
import { Add, Close, ImportContacts, PlaylistAddCheck } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';

import { DeleteCourseDialog } from './DeleteCourseDialog';

import { useUpdateCourse } from '@/adapters/mutations/courses.mutations';
import {
  useSaveLearningObjectives,
  useSavePrerequisites,
} from '@/adapters/mutations/courses.mutations';
import {
  useCourseLearningObjectives,
  useCoursePrerequisites,
  useCoursePrerequisiteOptions,
} from '@/adapters/queries/courses.queries';
import { useToast } from '@/adapters/stores/toast.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectItem } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { updateCourseSchema, type UpdateCourseFormInput } from '@/domain/schemas/course.schema';
import type { CourseDetail } from '@/domain/types/course.types';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

interface CourseInfoFormProps {
  course: CourseDetail;
  hideTeacherSelect?: boolean;
}

export function CourseInfoForm({
  course,
  hideTeacherSelect: _hideTeacherSelect,
}: CourseInfoFormProps) {
  const t = useTranslations('common');
  const router = useRouter();
  const updateMutation = useUpdateCourse();
  const saveObjectivesMutation = useSaveLearningObjectives();
  const savePrerequisitesMutation = useSavePrerequisites();
  const { showToast } = useToast();

  const { data: dbObjectives } = useCourseLearningObjectives(course.id);
  const { data: dbPrerequisites } = useCoursePrerequisites(course.id);
  const { data: availableCourses } = useCoursePrerequisiteOptions(course.id, course.tenant_id);

  const [objectives, setObjectives] = useState<string[]>([]);
  const [prereqIds, setPrereqIds] = useState<string[]>([]);

  useEffect(() => {
    if (dbObjectives) {
      setObjectives(dbObjectives.map((o) => o.objective));
    }
  }, [dbObjectives]);

  useEffect(() => {
    if (dbPrerequisites) {
      setPrereqIds(dbPrerequisites.map((p) => p.prerequisite_course_id));
    }
  }, [dbPrerequisites]);

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

  const availableOptions = (availableCourses || []).filter((c) => !prereqIds.includes(c.id));

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<UpdateCourseFormInput>({
    resolver: zodResolver(updateCourseSchema),
    defaultValues: {
      title: course.title,
      description: course.description ?? '',
      category: course.category ?? '',
      level: (course.level as 'beginner' | 'intermediate' | 'advanced') ?? 'beginner',
      is_free: course.is_free,
      price: course.price,
      slug: course.slug ?? '',
      thumbnail_url: course.thumbnail_url ?? '',
      teacher_id: course.teacher_id ?? '',
      status: (course.status as 'draft' | 'published' | 'archived') ?? 'draft',
    },
  });

  // Reset form when course data changes
  useEffect(() => {
    reset({
      title: course.title,
      description: course.description ?? '',
      category: course.category ?? '',
      level: (course.level as 'beginner' | 'intermediate' | 'advanced') ?? 'beginner',
      is_free: course.is_free,
      price: course.price,
      slug: course.slug ?? '',
      thumbnail_url: course.thumbnail_url ?? '',
      teacher_id: course.teacher_id ?? '',
      status: (course.status as 'draft' | 'published' | 'archived') ?? 'draft',
    });
  }, [course, reset]);

  const isFree = watch('is_free');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const isPending =
    updateMutation.isPending ||
    saveObjectivesMutation.isPending ||
    savePrerequisitesMutation.isPending;

  const onSubmit = async (data: UpdateCourseFormInput) => {
    const payload: Parameters<typeof updateMutation.mutateAsync>[0]['data'] = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description || null;
    if (data.category !== undefined) payload.category = data.category || null;
    if (data.level !== undefined) payload.level = data.level;
    if (data.price !== undefined) {
      payload.price = data.is_free ? 0 : data.price;
    }
    if (data.slug !== undefined) payload.slug = data.slug || null;
    if (data.thumbnail_url !== undefined) payload.thumbnail_url = data.thumbnail_url || null;
    if (data.teacher_id !== undefined) payload.teacher_id = data.teacher_id || null;
    if (data.status !== undefined) payload.status = data.status;

    try {
      await updateMutation.mutateAsync({ id: course.id, data: payload });

      const cleanObjectives = objectives.map((o) => o.trim()).filter(Boolean);
      await saveObjectivesMutation.mutateAsync({
        courseId: course.id,
        objectives: cleanObjectives,
      });
      await savePrerequisitesMutation.mutateAsync({
        courseId: course.id,
        prerequisiteCourseIds: prereqIds,
        tenantId: course.tenant_id,
      });

      showToast(t('course_updated_success'), 'success');
      reset(data);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('failed_to_save'), 'error');
    }
  };

  return (
    <>
      <div className="w-full max-w-4xl mx-auto lg:mx-0">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">{t('course_title_label')}</Label>
              <Input
                id="title"
                {...register('title')}
                error={errors.title?.message}
                placeholder={t('course_title_placeholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('description_label')}</Label>
              <textarea
                id="description"
                rows={4}
                className={cn(
                  'flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-faang min-h-[120px] resize-none',
                  errors.description && 'border-destructive focus-visible:ring-destructive/30',
                )}
                placeholder={t('description_placeholder')}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs font-bold text-destructive uppercase tracking-widest ps-1">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="thumbnail_url">{t('thumbnail_url_label')}</Label>
              <Input
                id="thumbnail_url"
                {...register('thumbnail_url')}
                error={errors.thumbnail_url?.message}
                placeholder={t('thumbnail_url_placeholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="category">{t('category_label')}</Label>
                <Input
                  id="category"
                  {...register('category')}
                  placeholder={t('category_placeholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('difficulty_level')}</Label>
                <Controller
                  name="level"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectItem value="beginner">{t('beginner')}</SelectItem>
                      <SelectItem value="intermediate">{t('intermediate')}</SelectItem>
                      <SelectItem value="advanced">{t('advanced')}</SelectItem>
                    </Select>
                  )}
                />
              </div>
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="slug">{t('url_slug')}</Label>
                <Input
                  id="slug"
                  {...register('slug')}
                  error={errors.slug?.message}
                  placeholder="advanced-react-patterns"
                />
                <p className="text-xs text-muted-foreground font-medium ps-1 italic">
                  {t('url_slug_helper')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/50">
              <div className="space-y-1">
                <Label className="text-base font-bold">{t('free_course_label')}</Label>
                <p className="text-xs text-muted-foreground font-medium">{t('free_course_desc')}</p>
              </div>
              <Controller
                name="is_free"
                control={control}
                render={({ field }) => (
                  <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>

            {!isFree && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                <Label htmlFor="price">{t('price_usd')}</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('price', { valueAsNumber: true })}
                  error={errors.price?.message}
                />
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

              {/* Badges of selected prerequisites */}
              <div className="flex flex-wrap gap-2">
                {prereqIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic font-medium">
                    {t('no_prerequisites')}
                  </p>
                ) : (
                  prereqIds.map((id) => {
                    const match = availableCourses?.find((c) => c.id === id);
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

              {/* Dropdown to add a prerequisite */}
              {availableOptions.length > 0 && (
                <div className="w-full max-w-md space-y-2">
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
                  <div
                    key={index}
                    className="flex gap-2 items-center animate-in fade-in duration-200"
                  >
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
          </div>

          <div className="flex items-center justify-between pt-8 mt-4 border-t border-border">
            <Button
              type="submit"
              disabled={isPending}
              isLoading={isPending}
              className="min-w-[160px] font-bold uppercase tracking-wider text-xs text-white"
            >
              <Save className="me-2 h-4 w-4" />
              {t('save_changes')}
            </Button>

            <Button
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="font-bold uppercase tracking-wider text-xs text-destructive hover:bg-destructive/10"
            >
              <DeleteOutline className="me-2 h-4 w-4" />
              {t('delete_course')}
            </Button>
          </div>
        </form>
      </div>

      <DeleteCourseDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onSuccess={() => {
          setIsDeleteDialogOpen(false);
          router.push('/courses');
        }}
        course={course}
      />
    </>
  );
}
