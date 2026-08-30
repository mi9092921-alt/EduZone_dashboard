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
import {
  Add,
  Quiz,
  Download,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  TextField,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';


import { SectionCard } from './curriculum-builder/SectionCard';

import {
  useCreateSection,
  useReorderSections,
} from '@/adapters/mutations/courses.mutations';
import type { Section } from '@/domain/types/course.types';
import { formatVideoUrl } from '@/domain/video.utils';
import { getCourseById } from '@/infrastructure/repos/courses.service';

// ══════════════════════════════════════════════════
// CURRICULUM BUILDER (main export)
// ══════════════════════════════════════════════════
interface CurriculumBuilderProps {
  courseId: string;
  sections: Section[];
}

export function CurriculumBuilder({ courseId, sections }: CurriculumBuilderProps) {
  const t = useTranslations('common');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [addingSec, setAddingSec] = useState(false);
  const [newSecTitle, setNewSecTitle] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const createSection = useCreateSection();
  const reorderSections = useReorderSections();

  const [localSections, setLocalSections] = useState(sections);
  useEffect(() => { setLocalSections(sections); }, [sections]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 15 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localSections.findIndex((s: Section) => s.id === active.id);
    const newIndex = localSections.findIndex((s: Section) => s.id === over.id);

    const newSections = arrayMove(localSections, oldIndex, newIndex);
    setLocalSections(newSections);

    const updates = newSections.map((s: Section, idx: number) => ({ id: s.id, order_index: idx }));
    await reorderSections.mutateAsync({ courseId, updates });
  };

  const handleAddSection = async () => {
    if (!newSecTitle.trim()) return;
    await createSection.mutateAsync({
      courseId,
      data: {
        title: newSecTitle,
        order_index: sections.length,
      },
    });
    setNewSecTitle('');
    setAddingSec(false);
  };

  const handleExportJSON = async () => {
    try {
      setIsExporting(true);
      const course = await getCourseById(courseId);
      if (!course) {
        throw new Error(t('course_data_not_found'));
      }

      const exportData = {
        course: {
          title: course.title,
          description: course.description,
          thumbnail_url: course.thumbnail_url,
          slug: course.slug,
          category: course.category,
          level: course.level,
          price: course.price,
          status: course.status,
        },
        sections: localSections.map((sec, sIdx) => ({
          title: sec.title,
          order_index: sIdx + 1,
          lessons: (sec.lessons || []).map((les, lIdx) => {
            const content = Array.isArray(les.content) ? les.content[0] : les.content;
            const provider = content?.provider || 'youtube';
            const path = content?.video_path || '';
            return {
              title: les.title,
              video_url: formatVideoUrl(provider, path),
              order_index: lIdx + 1,
              is_preview: les.is_preview || false,
              duration_sec: les.duration_sec,
            };
          }),
        }))
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Course_${course.title}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export curriculum JSON:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        flexWrap="wrap"
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1rem', sm: '1.25rem' },
              color: 'text.primary',
            }}
          >
            {t('curriculum_builder_title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontWeight: 500 }}>
            {t('curriculum_builder_desc')}
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<Download sx={{ fontSize: 18 }} />}
            onClick={handleExportJSON}
            disabled={localSections.length === 0 || isExporting}
            fullWidth={isMobile}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: 'text.secondary',
              borderColor: 'divider',
              borderRadius: 3,
              gap: 1,
              px: 2,
              '& .MuiButton-startIcon': { margin: 0 },
              '&:hover': { backgroundColor: 'action.hover', borderColor: 'primary.main' },
            }}
          >
            {isExporting ? t('exporting') : t('export_json')}
          </Button>
          <Button
            onClick={() => setAddingSec(true)}
            startIcon={<Add />}
            fullWidth={isMobile}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderRadius: 3,
              px: 3,
              gap: 1,
              boxShadow: 'none',
              '& .MuiButton-startIcon': { margin: 0 },
            }}
          >
            {t('add_new_section')}
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localSections.map((s: Section) => s.id)} strategy={verticalListSortingStrategy}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {localSections.map((section: Section, i: number) => (
                <SectionCard key={section.id} section={section} courseId={courseId} index={i} />
              ))}
            </Box>
          </SortableContext>
        </DndContext>

        {/* Add section form */}
        {addingSec && (
          <Box
            sx={{
              p: { xs: 3, sm: 4 },
              border: '2px dashed',
              borderColor: 'primary.main',
              borderRadius: 3,
              backgroundColor: 'action.hover',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            <TextField
              label={t('section_title_label')}
              value={newSecTitle}
              onChange={(e) => setNewSecTitle(e.target.value)}
              fullWidth
              autoFocus
              sx={{ 
                '& .MuiOutlinedInput-root': { 
                  borderRadius: 2,
                  backgroundColor: 'background.paper'
                } 
              }}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button
                onClick={() => setAddingSec(false)}
                sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary', borderRadius: 2 }}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="contained"
                onClick={handleAddSection}
                disabled={!newSecTitle.trim() || createSection.isPending}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  backgroundColor: 'primary.main',
                  '&:hover': { backgroundColor: 'primary.dark' },
                  boxShadow: 'none',
                }}
              >
                {t('create_section')}
              </Button>
            </Box>
          </Box>
        )}

        {sections.length === 0 && !addingSec && (
          <Box
            sx={{
              py: 10,
              textAlign: 'center',
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 4,
              backgroundColor: 'action.hover',
            }}
          >
            <Quiz sx={{ fontSize: 48, color: 'divider', mb: 1 }} />
            <Typography variant="body2" sx={{ color: 'text.disabled', mb: 2 }}>
              {t('no_sections_title')}
            </Typography>
            <Button
              onClick={() => setAddingSec(true)}
              startIcon={<Add />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                color: 'primary.main',
                border: '1px solid',
                borderColor: 'primary.main',
                borderRadius: 2,
                gap: 1,
                '& .MuiButton-startIcon': { margin: 0 },
              }}
            >
              {t('add_first_section')}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
