'use client';

import { useState, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { Add, Upload } from '@mui/icons-material';
import type { Course, CourseFilters, CourseStatus } from '@/domain/types/course.types';
import { useCourses } from '@/adapters/queries/courses.queries';
import { useUpdateCourse, useDeleteCourse } from '@/adapters/mutations/courses.mutations';
import { CourseStatsCards } from './CourseStatsCards';
import { CourseFiltersBar } from './CourseFiltersBar';
import { CoursesTable } from './CoursesTable';
import { CourseBulkActionBar, type CourseBulkAction } from './CourseBulkActionBar';
import { CreateCourseDialog } from './CreateCourseDialog';
import { DeleteCourseDialog } from './DeleteCourseDialog';
import { ImportCourseDialog } from './ImportCourseDialog';
import { Button } from '@/components/ui/Button';
import { useTranslations } from 'next-intl';
import { useToast } from '@/adapters/stores/toast.store';
import { getCourseById } from '@/infrastructure/repos/courses.service';
import { formatVideoUrl } from '@/domain/video.utils';

export function CoursesPage() {
  const router = useRouter();
  const t = useTranslations('common');
  const { showToast } = useToast();

  // ── State ───────────────────────────────────────────────────────
  const [filters, setFilters] = useState<CourseFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkPending, setIsBulkPending] = useState(false);

  const deleteMutation = useDeleteCourse();

  // ── Query ───────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useCourses(filters, page, pageSize);
  const courses = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  // ── Mutations ───────────────────────────────────────────────────
  const updateMutation = useUpdateCourse();

  // ── Handlers ────────────────────────────────────────────────────
  const handleViewCourse = useCallback(
    (course: Course) => router.push(`/courses/${course.id}`),
    [router],
  );

  const handleEditCourse = useCallback(
    (course: Course) => router.push(`/courses/${course.id}`),
    [router],
  );

  const handlePublishCourse = useCallback(
    (course: Course) => {
      updateMutation.mutate({ id: course.id, data: { status: 'published' } });
    },
    [updateMutation],
  );

  const handleArchiveCourse = useCallback(
    (course: Course) => {
      updateMutation.mutate({ id: course.id, data: { status: 'archived' } });
    },
    [updateMutation],
  );

  const handleDeleteCourse = useCallback((course: Course) => {
    setDeleteTarget(course);
  }, []);

  const handlePageChange = useCallback((newPage: number) => setPage(newPage), []);
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);
  const handleFiltersChange = useCallback((newFilters: CourseFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handleBulkAction = async (action: CourseBulkAction) => {
    if (selectedIds.length === 0) return;
    setIsBulkPending(true);

    try {
      if (action === 'delete') {
        for (const id of selectedIds) {
          await deleteMutation.mutateAsync(id);
        }
        showToast(t('bulk_action_success'), 'success');
        setSelectedIds([]);
      } else if (action === 'publish' || action === 'draft' || action === 'archive') {
        const newStatus: CourseStatus = action === 'publish' ? 'published' : action === 'draft' ? 'draft' : 'archived';
        for (const id of selectedIds) {
          await updateMutation.mutateAsync({ id, data: { status: newStatus } });
        }
        showToast(t('bulk_action_success'), 'success');
        setSelectedIds([]);
      } else if (action === 'export_json' || action === 'export_csv') {
        for (const id of selectedIds) {
          const courseDetail = await getCourseById(id);
          if (!courseDetail) continue;

          const fileName = `${courseDetail.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${id.slice(0, 5)}`;

          if (action === 'export_json') {
            const dataStr = JSON.stringify({
              course: {
                title: courseDetail.title,
                description: courseDetail.description,
                thumbnail_url: courseDetail.thumbnail_url,
                slug: courseDetail.slug,
                category: courseDetail.category,
                level: courseDetail.level,
                price: courseDetail.price,
                status: courseDetail.status,
              },
              sections: courseDetail.sections?.map(s => ({
                title: s.title,
                order_index: s.order_index,
                lessons: s.lessons?.map(l => {
                  const content = Array.isArray(l.content) ? l.content[0] : l.content;
                  const provider = content?.provider || 'youtube';
                  const path = content?.video_path || '';
                  return {
                    title: l.title,
                    video_url: formatVideoUrl(provider, path),
                    order_index: l.order_index,
                    is_preview: l.is_preview || false,
                    duration_sec: l.duration_sec,
                  };
                }) || []
              }))
            }, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${fileName}.json`;
            link.click();
            URL.revokeObjectURL(url);
          } else {
            const headers = ['ID', 'Title', 'Status', 'Level', 'Price', 'Created At'];
            const row = [
              courseDetail.id,
              `"${courseDetail.title.replace(/"/g, '""')}"`,
              courseDetail.status,
              courseDetail.level || '',
              courseDetail.price.toString(),
              courseDetail.created_at
            ];
            const csvContent = [headers.join(','), row.join(',')].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${fileName}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }
          await new Promise(r => setTimeout(r, 300));
        }
        showToast(t('export_started'), 'info');
      }
    } catch (err) {
      showToast(t('bulk_action_failed'), 'error');
    } finally {
      setIsBulkPending(false);
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{t('courses')}</h1>
          <div className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider border border-border">
            {totalCount.toLocaleString()} {t('total')}
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-1.5 animate-pulse text-primary text-xs font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {t('updating')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-2"
          >
            <Upload className="text-sm scale-90" />
            {t('import_json')}
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2"
          >
            <Add className="text-sm scale-90" />
            {t('create_course')}
          </Button>
        </div>
      </div>

      <CourseStatsCards />

      <CourseFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalCount={totalCount}
      />

      <div className="flex flex-col gap-4">
        {selectedIds.length > 0 && (
          <div className="px-2">
            <CourseBulkActionBar
              selectedCount={selectedIds.length}
              onClear={() => setSelectedIds([])}
              onAction={handleBulkAction}
              isPending={isBulkPending}
            />
          </div>
        )}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <CoursesTable
            courses={courses}
            isLoading={isLoading}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onViewCourse={handleViewCourse}
            onEditCourse={handleEditCourse}
            onPublishCourse={handlePublishCourse}
            onArchiveCourse={handleArchiveCourse}
            onDeleteCourse={handleDeleteCourse}
          />
        </div>
      </div>

      <CreateCourseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportCourseDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <DeleteCourseDialog
        course={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
