'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Switch,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Edit,
  Delete,
  DragIndicator,
  OndemandVideo,
  Description,
} from '@mui/icons-material';
import type { Lesson } from '@/domain/types/course.types';
import {
  useUpdateLesson,
  useDeleteLesson,
} from '@/adapters/mutations/courses.mutations';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/adapters/stores/toast.store';

// ── Helpers ─────────────────────────────────────────────
// ── Helpers ─────────────────────────────────────────────
function LessonIcon({ lesson }: { lesson: Lesson }) {
  if (lesson.content?.video_path || (Array.isArray(lesson.content) && lesson.content[0]?.video_path)) {
    return <OndemandVideo sx={{ fontSize: 20, color: 'primary.main' }} />;
  }
  return <Description sx={{ fontSize: 20, color: 'success.main' }} />;
}

function formatDuration(sec: number | null): string {
  if (!sec) return '';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

import { formatVideoUrl, isValidVideoUrl } from '@/domain/video.utils';

// ══════════════════════════════════════════════════
// LESSON ROW
// ══════════════════════════════════════════════════
export function LessonRow({
  lesson,
  courseId,
  index,
}: {
  lesson: Lesson;
  courseId: string;
  index: number;
}) {
  const theme = useTheme();
  const t = useTranslations('common');
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  
  // Optimistic UI state
  const [localPreview, setLocalPreview] = useState(lesson.is_preview);
  const [localPublished, setLocalPublished] = useState(lesson.is_published);

  // Sync with server state changes
  useEffect(() => { setLocalPreview(lesson.is_preview); }, [lesson.is_preview]);
  useEffect(() => { setLocalPublished(lesson.is_published); }, [lesson.is_published]);
  
  const content = Array.isArray(lesson.content) ? lesson.content[0] : lesson.content;
  const initialProvider = content?.provider || 'youtube';
  const initialPath = content?.video_path || '';
  const [videoPath, setVideoPath] = useState(formatVideoUrl(initialProvider, initialPath));
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 2 : 'auto',
  };

  const [urlError, setUrlError] = useState('');

  const handleSave = async () => {
    if (!videoPath.trim()) {
      setUrlError(t('video_url_required'));
      return;
    }
    if (!isValidVideoUrl(videoPath)) {
      setUrlError(t('invalid_video_url'));
      return;
    }
    setUrlError('');

    try {
      await updateLesson.mutateAsync({
        id: lesson.id,
        courseId,
        data: { 
          title, 
          video_url: videoPath // Mutator will handle the p_video_path update
        },
      });
      setEditing(false);
    } catch (err: any) {
      console.error('[LessonRow handleSave] Error:', err);
      setUrlError(err.message || 'An error occurred while saving the lesson.');
    }
  };

  const handleTogglePreview = async (e?: any) => {
    if (e?.stopPropagation) e.stopPropagation();
    const newValue = !localPreview;
    setLocalPreview(newValue); // Optimistic update
    try {
      await updateLesson.mutateAsync({
        id: lesson.id,
        courseId,
        data: { is_preview: newValue },
      });
    } catch (err) {
      setLocalPreview(!newValue); // Revert on error
      console.error(err);
    }
  };

  const handleTogglePublish = async (e?: any) => {
    if (e?.stopPropagation) e.stopPropagation();
    const newValue = !localPublished;
    setLocalPublished(newValue); // Optimistic update
    try {
      await updateLesson.mutateAsync({
        id: lesson.id,
        courseId,
        data: { is_published: newValue },
      });
    } catch (err) {
      setLocalPublished(!newValue); // Revert on error
      console.error(err);
    }
  };

  const handleDelete = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    await deleteLesson.mutateAsync({ id: lesson.id, courseId });
    showToast(t('lesson_deleted_successfully'), 'success');
    setIsDeleteDialogOpen(false);
  };

  if (editing) {
    return (
      <Box
        sx={{
          p: 2,
          border: '1px solid',
          borderColor: 'primary.main',
          borderRadius: 3,
          backgroundColor: 'action.hover',
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            size="small"
            label={t('lesson_title_label')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label={t('video_url')}
            value={videoPath}
            onChange={(e) => {
              setVideoPath(e.target.value);
              if (urlError) setUrlError('');
            }}
            error={!!urlError}
            helperText={urlError}
            fullWidth
            sx={{ 
              '& .MuiOutlinedInput-root': { 
                borderRadius: 1.5,
                backgroundColor: 'background.paper'
              } 
            }}
          />
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', flexGrow: 1 }}>
              {t('is_preview_label') || 'Free Preview'}
            </Typography>
            <Switch
              size="small"
              checked={localPreview}
              onChange={handleTogglePreview}
            />
          </Stack>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setEditing(false)} sx={{ textTransform: 'none', fontSize: '0.8125rem' }}>
              {t('cancel')}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={updateLesson.isPending}
              sx={{
                textTransform: 'none',
                fontSize: '0.8125rem',
                boxShadow: 'none',
                borderRadius: 2,
              }}
            >
              {t('save')}
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        p: { xs: 2, sm: 2.5 },
        gap: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        transition: 'border-color 200ms ease, background-color 200ms ease, transform 200ms ease',
        touchAction: 'manipulation',
        '&:hover': {
          borderColor: 'primary.main',
          backgroundColor: 'action.hover',
          transform: 'translateX(4px)',
          '& .lesson-actions': { opacity: 1 },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          {...attributes}
          {...listeners}
          sx={{ display: 'flex', cursor: 'grab', touchAction: 'none' }}
        >
          <DragIndicator sx={{ fontSize: 16, color: 'text.disabled' }} />
        </Box>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            backgroundColor: (lesson.content?.video_path || (Array.isArray(lesson.content) && (lesson.content as any)[0]?.video_path)) ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.success.main, 0.1),
            color: (lesson.content?.video_path || (Array.isArray(lesson.content) && (lesson.content as any)[0]?.video_path)) ? 'primary.main' : 'success.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 200ms ease',
          }}
        >
          <LessonIcon lesson={lesson} />
        </Box>
        <Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              display: 'block',
              maxWidth: { xs: '100%', sm: 300, md: 500 },
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}
          >
            {index + 1}. {lesson.title}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {(lesson.content?.video_path || (Array.isArray(lesson.content) && (lesson.content as any)[0]?.video_path)) ? t('lesson_type_video') : t('lesson_type_content')}
            {lesson.duration_sec ? ` • ${formatDuration(lesson.duration_sec)}` : ''}
            {localPreview && (
              <Box
                component="span"
                sx={{
                  ml: 1,
                  px: 0.8,
                  py: 0.1,
                  borderRadius: 1,
                  backgroundColor: alpha(theme.palette.success.main, 0.1),
                  color: 'success.main',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                }}
              >
                {t('preview') || 'Preview'}
              </Box>
            )}
          </Typography>
        </Box>
      </Box>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Box sx={{ mr: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', fontWeight: 700, mb: -0.5 }}>
            {t('is_preview_label') || 'PREVIEW'}
          </Typography>
          <Switch
            size="small"
            checked={localPreview}
            onChange={handleTogglePreview}
            onClick={(e) => e.stopPropagation()}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: 'success.main' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'success.main' },
            }}
          />
        </Box>
        <Box sx={{ mr: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', fontWeight: 700, mb: -0.5 }}>
            {t('is_published_label') || 'PUBLIC'}
          </Typography>
          <Switch
            size="small"
            checked={localPublished}
            onChange={handleTogglePublish}
            onClick={(e) => e.stopPropagation()}
          />
        </Box>
        <Box
          className="lesson-actions"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            opacity: { xs: 1, sm: 0 },
            transition: 'opacity 150ms ease',
          }}
        >
          <IconButton size="small" onClick={() => setEditing(true)} sx={{ color: 'text.disabled' }}>
            <Edit sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }} 
            sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
          >
            <Delete sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Stack>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title={t('delete_lesson_title')}
        description={t('delete_lesson_desc', { title: lesson.title })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        confirmColor="error"
        icon={<Delete />}
      />
    </Box>
  );
}
