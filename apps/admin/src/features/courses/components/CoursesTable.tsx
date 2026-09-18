'use client';

import { School, Star } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

import { CourseRowActions } from './CourseRowActions';

import { TablePagination } from '@/components/ui/TablePagination';
import type { Course } from '@/domain/types/course.types';
import { cn } from '@/lib/utils';


// ── Status config ────────────────────────────────────────────────
const STATUS_CONFIG = {
  published: {
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
  },
  draft: {
    color: 'text-slate dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-500/10 border-slate-300 dark:border-slate-500/20',
    dot: 'bg-slate-600 dark:bg-slate-400',
  },
  archived: {
    color: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20',
    dot: 'bg-rose-500 dark:bg-rose-400',
  },
} as const;

const LEVEL_CONFIG = {
  beginner: { color: 'text-slate-600 dark:text-slate-300', dot: 'bg-emerald-400' },
  intermediate: { color: 'text-slate-600 dark:text-slate-300', dot: 'bg-amber-400' },
  advanced: { color: 'text-slate-600 dark:text-slate-300', dot: 'bg-rose-500' },
} as const;

// Shared grid template for the desktop list — header and data rows MUST use the
// same tracks so labels stay aligned with cells. minmax(0,1fr) lets the course
// column shrink so truncation works instead of content overflowing neighbours.
// The 5rem track after the level column is the rating aggregate.
const DESKTOP_ROW_GRID =
  'grid grid-cols-[3rem_minmax(0,1fr)_9rem_7.5rem_5rem_6rem_6rem_13rem_5rem] items-center';

// Rating cell content shared by the desktop row and the mobile card:
// amber star + average (— when the course has no ratings yet).
function RatingCell({ course }: { course: Course }) {
  const hasRating = typeof course.rating === 'number' && course.rating > 0;
  return (
    <span className="inline-flex items-center gap-1 font-bold text-sm">
      <Star
        className={cn('h-4 w-4', hasRating ? 'text-amber-400' : 'text-muted-foreground/40')}
      />
      <span className={hasRating ? 'text-foreground' : 'text-muted-foreground'}>
        {hasRating ? course.rating!.toFixed(1) : '—'}
      </span>
      {hasRating && course.rating_count ? (
        <span className="text-[11px] font-medium text-muted-foreground">
          ({course.rating_count})
        </span>
      ) : null}
    </span>
  );
}

interface CoursesTableProps {
  courses: Course[];
  isLoading: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onViewCourse: (course: Course) => void;
  onEditCourse: (course: Course) => void;
  onPublishCourse: (course: Course) => void;
  onArchiveCourse: (course: Course) => void;
  onDraftCourse: (course: Course) => void;
  onDeleteCourse: (course: Course) => void;
}

export function CoursesTable({
  courses,
  isLoading,
  page,
  pageSize,
  totalCount,
  selectedIds,
  onSelectionChange,
  onPageChange,
  onPageSizeChange,
  onViewCourse,
  onEditCourse,
  onPublishCourse,
  onArchiveCourse,
  onDraftCourse,
  onDeleteCourse,
}: CoursesTableProps) {
  const t = useTranslations('common');

  const TABLE_HEADERS = [
    { label: '', className: 'px-4 text-center' },
    { label: t('course_header'), className: 'text-start px-6' },
    { label: t('status_header'), className: 'text-start px-6' },
    { label: t('level_header'), className: 'text-start px-6' },
    { label: t('rating_header'), className: 'text-center px-6' },
    { label: t('dashboard_lessons'), className: 'text-center px-6' },
    { label: t('price_header'), className: 'text-end px-6' },
    { label: t('teacher_date_header'), className: 'text-start px-6' },
    {
      label: '',
      className:
        'sticky end-0 z-20 bg-muted/30 text-end px-6 ltr:shadow-[-12px_0_12px_-10px_rgba(0,0,0,0.05)] rtl:shadow-[12px_0_12px_-10px_rgba(0,0,0,0.05)]',
    },
  ];

  const allSelected = courses.length > 0 && courses.every((c) => selectedIds.includes(c.id));
  const someSelected =
    courses.length > 0 && courses.some((c) => selectedIds.includes(c.id)) && !allSelected;

  const handleToggleAll = () => {
    if (allSelected) {
      onSelectionChange(selectedIds.filter((id) => !courses.some((c) => c.id === id)));
    } else {
      const newIds = [...selectedIds];
      courses.forEach((c) => {
        if (!newIds.includes(c.id)) newIds.push(c.id);
      });
      onSelectionChange(newIds);
    }
  };

  const handleToggleRow = (e: React.SyntheticEvent, courseId: string) => {
    e.stopPropagation();
    if (selectedIds.includes(courseId)) {
      onSelectionChange(selectedIds.filter((id) => id !== courseId));
    } else {
      onSelectionChange([...selectedIds, courseId]);
    }
  };

  return (
    <div className="w-full bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col min-h-0 min-w-0">
      {/* DESKTOP TABLE (≥md) — full columns with sticky edges */}
      <div className="overflow-x-auto min-w-0 flex-1 no-scrollbar hidden md:block">
        {/* ARIA table semantics: the grid is div-based, so the tabular roles
            are restored explicitly (e2e locates rows/cells by role, and
            screen readers keep table navigation). */}
        <div role="table" aria-label={t('courses')} className="min-w-[960px]">
          {/* ── Header — same grid template as data rows, so columns can't drift ── */}
          <div role="row" className={cn(DESKTOP_ROW_GRID, 'bg-muted/30 border-b border-border/60')}>
            {TABLE_HEADERS.map((h, i) => (
              <div
                key={h.label || i}
                role="columnheader"
                className={cn(
                  'py-4 text-[12px] font-extrabold text-foreground/70 uppercase tracking-widest min-w-0',
                  h.className,
                )}
              >
                {i === 0 ? (
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={handleToggleAll}
                      className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary/30 transition-all cursor-pointer"
                    />
                  </div>
                ) : (
                  h.label
                )}
              </div>
            ))}
          </div>
          {/* Skeletons are decorative: hidden from the a11y tree so the
              table exposes real rows only once data has loaded. */}
          <div
            role="rowgroup"
            aria-hidden={isLoading || undefined}
            className="divide-y divide-border/40"
          >
            {isLoading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <div key={i} className={cn(DESKTOP_ROW_GRID, 'py-4 animate-pulse')}>
                    <div className="px-4">
                      <div className="w-4 h-4 bg-muted rounded mx-auto" />
                    </div>
                    <div className="px-6 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-muted shrink-0" />
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-muted rounded" />
                        <div className="h-3 w-20 bg-muted rounded" />
                      </div>
                    </div>
                    <div className="px-6">
                      <div className="h-6 w-16 bg-muted rounded-full" />
                    </div>
                    <div className="px-6">
                      <div className="h-6 w-16 bg-muted rounded-full" />
                    </div>
                    <div className="px-6 flex justify-center">
                      <div className="h-6 w-12 bg-muted rounded-full" />
                    </div>
                    <div className="px-6 flex justify-end">
                      <div className="h-4 w-12 bg-muted rounded" />
                    </div>
                    <div className="px-6 space-y-2">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-20 bg-muted rounded" />
                    </div>
                    <div className="px-6">
                      <div className="h-8 w-8 bg-muted rounded-xl ms-auto" />
                    </div>
                  </div>
                ))
              : courses.map((course) => {
                  const status =
                    STATUS_CONFIG[course.status as keyof typeof STATUS_CONFIG] ??
                    STATUS_CONFIG.draft;
                  const level =
                    LEVEL_CONFIG[course.level as keyof typeof LEVEL_CONFIG] ??
                    LEVEL_CONFIG.beginner;

                  return (
                    <div
                      key={course.id}
                      role="row"
                      onClick={() => onViewCourse(course)}
                      className={cn(
                        DESKTOP_ROW_GRID,
                        'group hover:bg-muted/30 transition-all duration-200 cursor-pointer',
                        selectedIds.includes(course.id) && 'bg-primary/5',
                      )}
                    >
                      {/* Checkbox */}
                      <div
                        role="cell"
                        className="px-4 py-5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={course.title}
                            checked={selectedIds.includes(course.id)}
                            onChange={(e) => handleToggleRow(e, course.id)}
                            className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary/30 transition-all cursor-pointer"
                          />
                        </div>
                      </div>
                      {/* Course Title + Thumbnail */}
                      <div role="cell" className="px-6 py-5 min-w-0">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/10 shadow-sm shrink-0">
                            {course.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- The thumbnail needs a native onError fallback for unavailable course images.
                              <img
                                src={course.thumbnail_url}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className="w-full h-full items-center justify-center"
                              style={{ display: course.thumbnail_url ? 'none' : 'flex' }}
                            >
                              <School className="text-primary/60 text-2xl" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p
                              title={course.title}
                              className="text-[15px] font-bold text-foreground group-hover:text-primary transition-faang leading-tight truncate"
                            >
                              {course.title}
                            </p>
                            <p
                              title={course.category || undefined}
                              className="text-xs font-bold tracking-tight text-foreground/40 group-hover:text-foreground/60 transition-colors truncate"
                            >
                              {course.category || t('no_category')}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div role="cell" className="px-6 py-5 text-start min-w-0">
                        <div
                          className={cn(
                            'inline-flex max-w-full items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-tight border transition-faang',
                            status.bg,
                            status.color,
                          )}
                        >
                          <div className={cn('w-1.5 h-1.5 rounded-full shadow-sm shrink-0', status.dot)} />
                          <span className="truncate">{t(course.status as Parameters<typeof t>[0])}</span>
                        </div>
                      </div>

                      {/* Level */}
                      <div role="cell" className="px-6 py-5 text-start min-w-0">
                        <div
                          className={cn(
                            'inline-flex max-w-full items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest transition-faang',
                            level.color,
                          )}
                        >
                          <div className={cn('w-1.5 h-1.5 rounded-full shadow-sm shrink-0', level.dot)} />
                          <span className="truncate">{t((course.level || 'beginner') as Parameters<typeof t>[0])}</span>
                        </div>
                      </div>

                      {/* Rating */}
                      <div role="cell" className="px-6 py-5 text-center">
                        <RatingCell course={course} />
                      </div>

                      {/* Lessons Count */}
                      <div role="cell" className="px-6 py-5 text-center">
                        <div className="inline-flex items-center justify-center min-w-[2.5rem] h-8 px-3 rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {course.lesson_count || 0}
                        </div>
                      </div>

                      {/* Price */}
                      <div role="cell" className="px-6 py-5 text-end">
                        {course.is_free || course.price === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-[15px]">
                            {t('free')}
                          </span>
                        ) : (
                          <span className="text-foreground font-extrabold text-[15px]">
                            <span className="text-[10px] text-muted-foreground me-0.5 font-bold">
                              $
                            </span>
                            {course.price}
                          </span>
                        )}
                      </div>

                      {/* Teacher & Date Combined */}
                      <div role="cell" className="px-6 py-5 min-w-0">
                        <div className="flex flex-col gap-0.5">
                          <span
                            title={course.teacher_name || undefined}
                            className="text-foreground/80 text-sm font-semibold truncate"
                          >
                            {course.teacher_name || '—'}
                          </span>
                          <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                            {new Date(course.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div
                        role="cell"
                        className="sticky end-0 z-10 px-6 py-5 bg-card group-hover:bg-card hover:!bg-muted/30 transition-colors text-end ltr:shadow-[-12px_0_12px_-10px_rgba(0,0,0,0.05)] rtl:shadow-[12px_0_12px_-10px_rgba(0,0,0,0.05)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CourseRowActions
                          course={course}
                          onView={onViewCourse}
                          onEdit={onEditCourse}
                          onPublish={onPublishCourse}
                          onArchive={onArchiveCourse}
                          onDraft={onDraftCourse}
                          onDelete={onDeleteCourse}
                        />
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>

      {/* MOBILE (<md): stacked card list — the standard for wide tables on phones */}
      <div className="md:hidden flex-1 min-w-0">
        {isLoading ? (
          <div className="divide-y divide-border/40">
            {Array.from({ length: pageSize }).map((_, i) => (
              <div key={i} className="p-4 flex items-start gap-3 animate-pulse">
                <div className="h-4 w-4 bg-muted rounded mt-1" />
                <div className="h-12 w-12 bg-muted rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-muted rounded" />
                  <div className="h-5 w-28 bg-muted rounded-full" />
                  <div className="h-3 w-36 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {courses.map((course) => {
              const status =
                STATUS_CONFIG[course.status as keyof typeof STATUS_CONFIG] ??
                STATUS_CONFIG.draft;
              const level =
                LEVEL_CONFIG[course.level as keyof typeof LEVEL_CONFIG] ??
                LEVEL_CONFIG.beginner;

              return (
                <div
                  key={course.id}
                  onClick={() => onViewCourse(course)}
                  className={cn(
                    'p-4 cursor-pointer transition-colors hover:bg-muted/30',
                    selectedIds.includes(course.id) && 'bg-primary/5',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={course.title}
                      className="h-4 w-4 mt-1 rounded border-border bg-background text-primary focus:ring-primary/30 transition-all cursor-pointer shrink-0"
                      checked={selectedIds.includes(course.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleToggleRow(e, course.id)}
                    />
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/10 shadow-sm shrink-0">
                      {course.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- The thumbnail needs a native onError fallback for unavailable course images.
                        <img
                          src={course.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="w-full h-full items-center justify-center"
                        style={{ display: course.thumbnail_url ? 'none' : 'flex' }}
                      >
                        <School className="text-primary/60 text-xl" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[15px] font-bold text-foreground leading-tight line-clamp-2">
                          {course.title}
                        </p>
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <CourseRowActions
                            course={course}
                            onView={onViewCourse}
                            onEdit={onEditCourse}
                            onPublish={onPublishCourse}
                            onArchive={onArchiveCourse}
                            onDraft={onDraftCourse}
                            onDelete={onDeleteCourse}
                          />
                        </div>
                      </div>
                      <p className="text-xs font-bold tracking-tight text-foreground/40 mt-0.5">
                        {course.category || t('no_category')}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <div
                          className={cn(
                            'inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-tight border transition-faang',
                            status.bg,
                            status.color,
                          )}
                        >
                          <div className={cn('w-1.5 h-1.5 rounded-full shadow-sm', status.dot)} />
                          {t(course.status as Parameters<typeof t>[0])}
                        </div>
                        <div
                          className={cn(
                            'inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest transition-faang',
                            level.color,
                          )}
                        >
                          <div className={cn('w-1.5 h-1.5 rounded-full shadow-sm', level.dot)} />
                          {t((course.level || 'beginner') as Parameters<typeof t>[0])}
                        </div>
                        <div className="inline-flex items-center justify-center min-w-[2.5rem] h-8 px-3 rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {course.lesson_count || 0}
                        </div>
                        <RatingCell course={course} />
                        {course.is_free || course.price === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-[15px]">
                            {t('free')}
                          </span>
                        ) : (
                          <span className="text-foreground font-extrabold text-[15px]">
                            <span className="text-[10px] text-muted-foreground me-0.5 font-bold">$</span>
                            {course.price}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {course.teacher_name || '—'}
                        <span className="mx-1.5">·</span>
                        {new Date(course.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isLoading && courses.length === 0 && (
        <div className="py-20 text-center space-y-3">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-muted/50 mb-2">
            <School className="text-muted-foreground/40 text-3xl" />
          </div>
          <p className="text-sm font-medium text-foreground">{t('no_courses_found')}</p>
          <p className="text-xs text-muted-foreground">{t('adjust_filters')}</p>
        </div>
      )}

      {/* Pagination Footer */}
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
