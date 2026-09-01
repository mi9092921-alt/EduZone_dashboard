'use client';

import { School } from '@mui/icons-material';
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
  onDeleteCourse,
}: CoursesTableProps) {
  const t = useTranslations('common');

  const TABLE_HEADERS = [
    { label: '', className: 'w-12 px-4' },
    { label: t('course_header'), className: 'text-start w-[40%]' },
    { label: t('status_header'), className: 'text-start w-32' },
    { label: t('level_header'), className: 'text-start w-28' },
    { label: t('dashboard_lessons'), className: 'text-center w-24' },
    { label: t('price_header'), className: 'text-end w-24' },
    { label: t('teacher_date_header'), className: 'text-start w-52' },
    {
      label: '',
      className:
        'sticky end-0 z-20 bg-muted border-b border-border/60 text-end w-20 shadow-[-12px_0_12px_-10px_rgba(0,0,0,0.05)] overflow-visible',
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
      <div className="overflow-x-auto min-w-0 flex-1 no-scrollbar">
        <table className="w-full text-start border-separate border-spacing-0 min-w-[900px]">
          <thead>
            <tr className="bg-muted/30 border-b border-border/60">
              {TABLE_HEADERS.map((h, i) => (
                <th
                  key={h.label || i}
                  className={cn(
                    'py-4 text-[12px] font-extrabold text-foreground/70 uppercase tracking-widest',
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
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-muted" />
                        <div className="space-y-2">
                          <div className="h-4 w-32 bg-muted rounded" />
                          <div className="h-3 w-20 bg-muted rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-16 bg-muted rounded-full" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-16 bg-muted rounded-full" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-12 bg-muted rounded-full mx-auto" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-12 bg-muted rounded ml-auto text-end" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-muted rounded" />
                        <div className="h-3 w-20 bg-muted rounded" />
                      </div>
                    </td>
                    <td className="sticky end-0 px-6 py-4 bg-card">
                      <div className="h-8 w-8 bg-muted rounded-xl ml-auto" />
                    </td>
                  </tr>
                ))
              : courses.map((course) => {
                  const status =
                    STATUS_CONFIG[course.status as keyof typeof STATUS_CONFIG] ??
                    STATUS_CONFIG.draft;
                  const level =
                    LEVEL_CONFIG[course.level as keyof typeof LEVEL_CONFIG] ??
                    LEVEL_CONFIG.beginner;

                  return (
                    <tr
                      key={course.id}
                      onClick={() => onViewCourse(course)}
                      className={cn(
                        'group hover:bg-muted/30 transition-all duration-200 cursor-pointer',
                        selectedIds.includes(course.id) && 'bg-primary/5',
                      )}
                    >
                      {/* Checkbox */}
                      <td
                        className="px-4 py-5 border-b border-border/40 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(course.id)}
                            onChange={(e) => handleToggleRow(e, course.id)}
                            className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary/30 transition-all cursor-pointer"
                          />
                        </div>
                      </td>
                      {/* Course Title + Thumbnail */}
                      <td className="px-6 py-5 border-b border-border/40">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/10 shadow-sm shrink-0">
                            {course.thumbnail_url ? (
                              <img
                                src={course.thumbnail_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <School className="text-primary/60 text-2xl" />
                            )}
                          </div>
                          <div className="space-y-0.5 max-w-[320px]">
                            <p className="text-[15px] font-bold text-foreground group-hover:text-primary transition-faang leading-tight line-clamp-2">
                              {course.title}
                            </p>
                            <p className="text-xs font-bold tracking-tight text-foreground/40 group-hover:text-foreground/60 transition-colors">
                              {course.category || t('no_category')}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-5 border-b border-border/40 text-start">
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
                      </td>

                      {/* Level */}
                      <td className="px-6 py-5 border-b border-border/40 text-start">
                        <div
                          className={cn(
                            'inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest transition-faang',
                            level.color,
                          )}
                        >
                          <div className={cn('w-1.5 h-1.5 rounded-full shadow-sm', level.dot)} />
                          {t((course.level || 'beginner') as Parameters<typeof t>[0])}
                        </div>
                      </td>

                      {/* Lessons Count */}
                      <td className="px-6 py-5 border-b border-border/40 text-center">
                        <div className="inline-flex items-center justify-center min-w-[2.5rem] h-8 px-3 rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {course.lesson_count || 0}
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-6 py-5 border-b border-border/40 text-end">
                        {course.is_free || course.price === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-[15px]">
                            {t('free')}
                          </span>
                        ) : (
                          <span className="text-foreground font-extrabold text-[15px]">
                            <span className="text-[10px] text-muted-foreground mr-0.5 font-bold">
                              $
                            </span>
                            {course.price}
                          </span>
                        )}
                      </td>

                      {/* Teacher & Date Combined */}
                      <td className="px-6 py-5 border-b border-border/40">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-foreground/80 text-sm font-semibold truncate max-w-[180px]">
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
                      </td>

                      {/* Actions */}
                      <td
                        className="sticky end-0 z-10 px-6 py-5 bg-card group-hover:bg-card hover:!bg-muted/30 transition-colors border-b border-border/40 text-end shadow-[-12px_0_12px_-10px_rgba(0,0,0,0.05)] overflow-visible"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CourseRowActions
                          course={course}
                          onView={onViewCourse}
                          onEdit={onEditCourse}
                          onPublish={onPublishCourse}
                          onArchive={onArchiveCourse}
                          onDelete={onDeleteCourse}
                        />
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
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
