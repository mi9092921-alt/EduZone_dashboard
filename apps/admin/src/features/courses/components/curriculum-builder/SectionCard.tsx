'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Add,
  ExpandMore,
  ExpandLess,
  Edit,
  Delete,
  DragIndicator,
  UploadFile,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Switch,
  Collapse,
  Stack,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

import { ImportLessonsDialog } from './ImportLessonsDialog';
import { LessonRow } from './LessonRow';

import {
  useUpdateSection,
  useDeleteSection,
  useCreateLesson,
  useReorderLessons,
} from '@/adapters/mutations/courses.mutations';
import { useToast } from '@/adapters/stores/toast.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getErrorMessage } from '@/domain/errors';
import type { Section, Lesson } from '@/domain/types/course.types';
import { isValidVideoUrl } from '@/domain/video.utils';

// ══════════════════════════════════════════════════
// SECTION CARD
// ══════════════════════════════════════════════════
export function SectionCard({
  section,
  courseId,
  index,
}: {
  section: Section;
  courseId: string;
  index: number;
}) {
  const t = useTranslations('common');
  const { showToast } = useToast();

  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [addingLesson, setAddingLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonUrl, setNewLessonUrl] = useState('');
  const [newLessonIsPreview, setNewLessonIsPreview] = useState(false);
  const [localPublished, setLocalPublished] = useState(section.is_published);

  useEffect(() => {
    setLocalPublished(section.is_published);
  }, [section.is_published]);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const createLesson = useCreateLesson();
  const reorderLessons = useReorderLessons();

  const [importingJson, setImportingJson] = useState(false);

  const [localLessons, setLocalLessons] = useState(section.lessons || []);
  useEffect(() => { setLocalLessons(section.lessons || []); }, [section.lessons]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 'auto',
  };

  const lessonSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 15 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleLessonDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localLessons.findIndex((l: Lesson) => l.id === active.id);
    const newIndex = localLessons.findIndex((l: Lesson) => l.id === over.id);

    const newLessons = arrayMove(localLessons, oldIndex, newIndex);
    setLocalLessons(newLessons);

    const updates = newLessons.map((l: Lesson, idx: number) => ({ id: l.id, order_index: idx }));
    await reorderLessons.mutateAsync({ courseId, updates });
  };

  const handleSaveTitle = async () => {
    await updateSection.mutateAsync({ id: section.id, courseId, data: { title } });
    setEditingTitle(false);
  };

  const handleTogglePublish = async (e?: React.SyntheticEvent) => {
    if (e?.stopPropagation) e.stopPropagation();
    const newValue = !localPublished;
    setLocalPublished(newValue);
    try {
      await updateSection.mutateAsync({ id: section.id, courseId, data: { is_published: newValue } });
    } catch (err) {
      setLocalPublished(!newValue);
      console.error(err);
    }
  };

  const handleDeleteSection = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDeleteSection = async () => {
    await deleteSection.mutateAsync({ id: section.id, courseId });
    showToast(t('section_deleted_successfully'), 'success');
    setIsDeleteDialogOpen(false);
  };

  const [urlError, setUrlError] = useState('');

  const handleAddLesson = async () => {
    if (!newLessonTitle.trim()) return;

    if (!newLessonUrl.trim()) {
      setUrlError(t('video_url_required'));
      return;
    }
    if (!isValidVideoUrl(newLessonUrl)) {
      setUrlError(t('invalid_video_url'));
      return;
    }
    setUrlError('');

    const nextIndex = section.lessons?.length ?? 0;
    try {
      await createLesson.mutateAsync({
        sectionId: section.id,
        courseId,
        data: {
          title: newLessonTitle,
          video_url: newLessonUrl,
          is_preview: newLessonIsPreview,
          order_index: nextIndex,
        },
      });
      setNewLessonTitle('');
      setNewLessonUrl('');
      setNewLessonIsPreview(false);
      setAddingLesson(false);
    } catch (err: unknown) {
      console.error('[handleAddLesson] Error:', err);
      setUrlError(getErrorMessage(err) || 'An error occurred while adding the lesson.');
    }
  };



  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: 'background.paper',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
        touchAction: 'manipulation',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        },
      }}
    >
      {/* Section Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        flexWrap="wrap"
        spacing={2}
        sx={{
          p: { xs: 2, sm: 2.5 },
          gap: 1.5,
          backgroundColor: 'action.hover',
          borderBottom: expanded ? '1px solid' : 'none',
          borderColor: 'divider',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
          <Box
            {...attributes}
            {...listeners}
            sx={{ display: 'flex', cursor: 'grab', touchAction: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <DragIndicator sx={{ fontSize: 18, color: 'text.disabled' }} />
          </Box>
          {editingTitle ? (
            <Box
              sx={{ display: 'flex', gap: 1, flexGrow: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <TextField
                size="small"
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                sx={{ 
                  '& .MuiOutlinedInput-root': { 
                    borderRadius: 1.5,
                    backgroundColor: 'background.paper',
                    '& fieldset': { borderColor: 'primary.main' }
                  } 
                }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={handleSaveTitle}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  minWidth: 'auto',
                  boxShadow: 'none',
                  borderRadius: 2,
                }}
              >
                {t('save')}
              </Button>
            </Box>
          ) : (
            <Typography
              sx={{
                fontWeight: 800,
                color: 'text.primary',
                fontSize: { xs: '0.875rem', sm: '1rem' },
                flexGrow: 1,
                minWidth: 0,
                wordBreak: 'break-word',
              }}
            >
              {t('section_header', { index: index + 1, title: section.title })}
            </Typography>
          )}
        </Box>

        <Stack
          direction="row"
          alignItems="center"
          justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
          spacing={1}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          <Typography variant="caption" sx={{ color: 'text.disabled', whiteSpace: 'nowrap' }}>
            {t('lesson_count', { count: section.lessons?.length ?? 0 })}
          </Typography>
          <Switch
            size="small"
            checked={localPublished}
            onChange={handleTogglePublish}
            onClick={(e) => e.stopPropagation()}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: 'primary.main' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: 'primary.main',
              },
            }}
          />
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setEditingTitle(!editingTitle);
              }}
              sx={{ color: 'text.disabled' }}
            >
              <Edit sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSection();
              }}
              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
            >
              <Delete sx={{ fontSize: 16 }} />
            </IconButton>
            {expanded ? (
              <ExpandLess sx={{ fontSize: 20, color: 'text.disabled' }} />
            ) : (
              <ExpandMore sx={{ fontSize: 20, color: 'text.disabled' }} />
            )}
          </Stack>
        </Stack>
      </Stack>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDeleteSection}
        title={t('delete_section_title')}
        description={t('delete_section_desc', { title: section.title })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        confirmColor="error"
        icon={<Delete />}
      />

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <DndContext sensors={lessonSensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
            <SortableContext items={localLessons.map((l: Lesson) => l.id)} strategy={verticalListSortingStrategy}>
              {localLessons.map((lesson, i) => (
                <LessonRow key={lesson.id} lesson={lesson} courseId={courseId} index={i} />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add lesson form */}
          {addingLesson ? (
            <Box
              sx={{
                p: { xs: 2, sm: 3 },
                border: '2px dashed',
                borderColor: 'primary.main',
                borderRadius: 3,
                backgroundColor: 'action.hover',
                display: 'flex',
                flexDirection: 'column',
                gap: 2.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  backgroundColor: 'background.default',
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: 'primary.main' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: '2px' },
                },
                '& .MuiInputLabel-root': {
                  color: 'text.secondary',
                  fontWeight: 500,
                  '&.Mui-focused': { color: 'primary.main', fontWeight: 700 },
                },
                '& .MuiInputBase-input': {
                  color: 'text.primary',
                  fontSize: '0.9rem',
                },
              }}
            >
              <TextField
                size="small"
                label={t('lesson_title_label')}
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
                fullWidth
                autoFocus
              />
              <TextField
                size="small"
                label={t('video_url')}
                value={newLessonUrl}
                onChange={(e) => {
                  setNewLessonUrl(e.target.value);
                  if (urlError) setUrlError('');
                }}
                error={!!urlError}
                helperText={urlError}
                fullWidth
              />
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1, fontWeight: 500 }}>
                  {t('is_preview_label') || 'Free Preview'}
                </Typography>
                <Switch
                  size="small"
                  checked={newLessonIsPreview}
                  onChange={(e) => setNewLessonIsPreview(e.target.checked)}
                />
              </Stack>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  onClick={() => setAddingLesson(false)}
                  sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
                >
                  {t('cancel')}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleAddLesson}
                  disabled={!newLessonTitle.trim() || createLesson.isPending}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.8125rem',
                    boxShadow: 'none',
                    borderRadius: 2,
                  }}
                >
                  {t('add_lesson_btn')}
                </Button>
              </Box>
            </Box>
          ) : (
            <Stack
              direction={{ xs: 'column', sm: 'column', md: 'row' }}
              spacing={1.5}
              sx={{ mt: 0.5 }}
            >
              <Button
                fullWidth
                onClick={() => setAddingLesson(true)}
                startIcon={<Add sx={{ fontSize: 18 }} />}
                sx={{
                  py: 1.5,
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  color: 'text.disabled',
                  textTransform: 'none',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  gap: 1,
                  '& .MuiButton-startIcon': { margin: 0 },
                  '&:hover': {
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                {t('add_lesson')}
              </Button>
              <Button
                fullWidth
                onClick={() => setImportingJson(true)}
                startIcon={<UploadFile sx={{ fontSize: 18 }} />}
                sx={{
                  py: 1.5,
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  color: 'text.disabled',
                  textTransform: 'none',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  gap: 1,
                  '& .MuiButton-startIcon': { margin: 0 },
                  '&:hover': {
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                {t('import_json')}
              </Button>
            </Stack>
          )}
        </Box>
      </Collapse>

      <ImportLessonsDialog
        open={importingJson}
        onClose={() => setImportingJson(false)}
        courseId={courseId}
        sectionId={section.id}
        existingLessonsCount={section.lessons?.length ?? 0}
      />
    </Box>
  );
}
