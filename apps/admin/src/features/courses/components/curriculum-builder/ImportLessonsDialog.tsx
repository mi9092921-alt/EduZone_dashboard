'use client';

import {
  Close,
  UploadFile,
  ContentPaste,
  CheckCircle,
  ContentCopy,
  DeleteOutline,
  Visibility,
  VisibilityOff,
  Code,
  InfoOutlined,
  ArrowDropDown,
  ArrowDropUp,
} from '@mui/icons-material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Alert,
  Stack,
  Collapse,
  Card,
  Divider,
  Tooltip,
  Badge,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab,
} from '@mui/material';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useRef, useEffect } from 'react';

import { useCreateLessons } from '@/adapters/mutations/courses.mutations';
import { useToast } from '@/adapters/stores/toast.store';
import { getErrorMessage } from '@/domain/errors';
import { isValidVideoUrl } from '@/domain/video.utils';

interface ImportLessonsDialogProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  sectionId: string;
  existingLessonsCount: number;
}

interface ParsedLesson {
  id: string; // client-side unique id
  title: string;
  video_url: string;
  is_preview: boolean;
  duration_sec: number;
  order_index?: number;
}

const TEMPLATE_JSON = [
  {
    title: 'Introduction',
    video_url: 'https://youtu.be/0Xx0Hh0Vv',
  },
  {
    title: 'Core Fundamentals',
    video_url: 'https://youtu.be/0Xx0Hh0Vv',
  },
];

export function ImportLessonsDialog({
  open,
  onClose,
  courseId,
  sectionId,
  existingLessonsCount,
}: ImportLessonsDialogProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { showToast } = useToast();
  const createLessonsBulk = useCreateLessons();

  // Dialog Navigation & Inputs
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [jsonInput, setJsonInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Live Parsed State
  const [lessonsPreview, setLessonsPreview] = useState<ParsedLesson[]>([]);
  const [copied, setCopied] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state on close or open
  useEffect(() => {
    if (open) {
      setJsonInput('');
      setJsonError(null);
      setLessonsPreview([]);
      setCopied(false);
    }
  }, [open]);

  // Clean and parse text inputs
  const handleParseJSON = (text: string) => {
    setJsonError(null);
    const cleaned = text.trim();
    if (!cleaned) {
      setLessonsPreview([]);
      return;
    }

    try {
      const parsed = JSON.parse(cleaned);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      interface RawImportedLesson {
        title?: string;
        video_url?: string;
        url?: string;
        order_index?: number;
        order?: number;
        duration_sec?: number;
        duration?: number;
        is_preview?: boolean;
      }

      const mapped = (items as RawImportedLesson[]).map((item, idx: number) => {
        const title = item.title || (isRtl ? `درس جديد #${idx + 1}` : `New Lesson #${idx + 1}`);
        const video_url = item.video_url || item.url || '';
        const order =
          typeof item.order_index === 'number'
            ? item.order_index
            : typeof item.order === 'number'
              ? item.order
              : existingLessonsCount + idx;

        return {
          id: `lesson-temp-${Date.now()}-${idx}-${Math.random()}`,
          title,
          video_url,
          is_preview: typeof item.is_preview === 'boolean' ? item.is_preview : false,
          duration_sec: Number(item.duration_sec || item.duration || 0),
          order_index: order,
        };
      });

      setLessonsPreview(mapped);
    } catch (err: unknown) {
      setLessonsPreview([]);
      setJsonError(getErrorMessage(err) || t('invalid_json_format'));
    }
  };

  // On Paste input change
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setJsonInput(val);
    handleParseJSON(val);
  };

  // Copy template JSON to clipboard
  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(JSON.stringify(TEMPLATE_JSON, null, 2));
    setCopied(true);
    showToast(isRtl ? 'تم نسخ النموذج بنجاح!' : 'Template copied successfully!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  // Drag and Drop File Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setJsonInput(text);
      handleParseJSON(text);
    };
    reader.onerror = () => {
      setJsonError(isRtl ? 'فشل قراءة الملف.' : 'Failed to read file.');
    };
    reader.readAsText(file);
  };

  // Edit fields inside live preview
  const handleUpdatePreviewLesson = (id: string, updates: Partial<ParsedLesson>) => {
    setLessonsPreview((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const handleRemovePreviewLesson = (id: string) => {
    setLessonsPreview((prev) => prev.filter((item) => item.id !== id));
  };

  // Import Execution
  const handleImport = async () => {
    if (lessonsPreview.length === 0) return;

    // Check for any invalid YouTube/video URL
    const invalidItem = lessonsPreview.find((l) => !l.video_url || !isValidVideoUrl(l.video_url));
    if (invalidItem) {
      showToast(
        isRtl
          ? `الدرس "${invalidItem.title}" يحتوي على رابط فيديو غير صالح!`
          : `Lesson "${invalidItem.title}" has an invalid video URL!`,
        'error',
      );
      return;
    }

    try {
      const lessonsData = lessonsPreview.map((item, idx) => ({
        title: item.title,
        video_url: item.video_url,
        is_preview: item.is_preview,
        duration_sec: item.duration_sec,
        order_index: item.order_index ?? existingLessonsCount + idx,
      }));

      await createLessonsBulk.mutateAsync({
        sectionId,
        courseId,
        data: lessonsData,
      });

      showToast(
        isRtl
          ? `تم استيراد ${lessonsPreview.length} دروس بنجاح!`
          : `Successfully imported ${lessonsPreview.length} lessons!`,
        'success',
      );
      onClose();
    } catch (err: unknown) {
      showToast(getErrorMessage(err) || t('failed_to_import'), 'error');
    }
  };

  // Helpers for time formatting
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 3,
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
          backgroundColor: theme.palette.mode === 'dark' ? '#151521' : '#ffffff',
          backgroundImage:
            theme.palette.mode === 'dark'
              ? 'linear-gradient(145deg, #1e1e2d 0%, #151521 100%)'
              : 'linear-gradient(145deg, #ffffff 0%, #f7f9fc 100%)',
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? 'rgba(10, 10, 15, 0.85)'
                : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(8px)',
          },
        },
      }}
    >
      {/* Title Header */}
      <DialogTitle
        sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1.5, pt: 2.5, px: 3 }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <UploadFile sx={{ color: 'primary.main', fontSize: 28 }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {t('import_lessons_title')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {isRtl
                  ? 'أضف دروساً متعددة فوراً إلى هذا القسم'
                  : 'Add multiple lessons instantly to this section'}
              </Typography>
            </Box>
          </Stack>
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
            <Close />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 3.5,
          overflowY: 'auto',
          '&::-webkit-scrollbar': { width: '8px' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.15)',
            borderRadius: '4px',
          },
        }}
      >
        {/* Schema Instructions Collapsible Panel */}
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <Button
            fullWidth
            onClick={() => setShowSchema(!showSchema)}
            endIcon={showSchema ? <ArrowDropUp /> : <ArrowDropDown />}
            sx={{
              justifyContent: 'space-between',
              textTransform: 'none',
              py: 1.5,
              px: 2.5,
              color: 'text.primary',
              fontWeight: 600,
              backgroundColor: 'action.hover',
              '&:hover': { backgroundColor: 'action.selected' },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <InfoOutlined color="primary" sx={{ fontSize: 20 }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {isRtl ? 'تعليمات المخطط (Schema)' : 'Schema Instructions'}
              </Typography>
            </Stack>
          </Button>

          <Collapse in={showSchema} timeout="auto" unmountOnExit>
            <Box
              sx={{
                p: 3,
                borderTop: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.paper',
                maxHeight: 400,
                overflowY: 'auto',
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'rgba(0,0,0,0.15)',
                  borderRadius: '4px',
                },
              }}
            >
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                {isRtl
                  ? 'يرجى توفير مصفوفة JSON تحتوي على الدروس. ندعم الحقول التالية:'
                  : 'Please provide a JSON array containing the lessons. We support the following fields:'}
              </Typography>

              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
              >
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    backgroundColor: 'action.hover',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 800,
                      color: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mb: 0.5,
                    }}
                  >
                    title <span style={{ color: 'red' }}>*</span>
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', lineHeight: 1.4 }}
                  >
                    {isRtl ? 'عنوان الدرس (مطلوب)' : 'Lesson Title (Required)'}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    backgroundColor: 'action.hover',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 800,
                      color: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mb: 0.5,
                    }}
                  >
                    video_url <span style={{ color: 'red' }}>*</span>
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', lineHeight: 1.4 }}
                  >
                    {isRtl
                      ? 'رابط الفيديو من يوتيوب أو فيميو (مطلوب)'
                      : 'YouTube or Vimeo Video URL (Required)'}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Collapse>
        </Box>

        {/* Supported Template Collapsible Panel */}
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <Button
            fullWidth
            onClick={() => setShowTemplate(!showTemplate)}
            endIcon={showTemplate ? <ArrowDropUp /> : <ArrowDropDown />}
            sx={{
              justifyContent: 'space-between',
              textTransform: 'none',
              py: 1.5,
              px: 2.5,
              color: 'text.primary',
              fontWeight: 600,
              backgroundColor: 'action.hover',
              '&:hover': { backgroundColor: 'action.selected' },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Code color="primary" sx={{ fontSize: 20 }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {isRtl ? 'النموذج المدعوم' : 'Supported Template'}
              </Typography>
            </Stack>
          </Button>

          <Collapse in={showTemplate} timeout="auto" unmountOnExit>
            <Box
              sx={{
                p: 3,
                borderTop: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.paper',
                maxHeight: 400,
                overflowY: 'auto',
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'rgba(0,0,0,0.15)',
                  borderRadius: '4px',
                },
              }}
            >
              <Box sx={{ position: 'relative' }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <Code sx={{ fontSize: 16 }} />{' '}
                    {isRtl ? 'مثال على كود JSON:' : 'JSON Template Example:'}
                  </Typography>
                  <Button
                    size="small"
                    startIcon={
                      copied ? (
                        <CheckCircle sx={{ fontSize: 16 }} />
                      ) : (
                        <ContentCopy sx={{ fontSize: 16 }} />
                      )
                    }
                    onClick={handleCopyTemplate}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    {copied
                      ? isRtl
                        ? 'تم النسخ!'
                        : 'Copied!'
                      : isRtl
                        ? 'نسخ النموذج'
                        : 'Copy Template'}
                  </Button>
                </Stack>
                <Box
                  component="pre"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    backgroundColor: 'action.hover',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                    m: 0,
                  }}
                >
                  {JSON.stringify(TEMPLATE_JSON, null, 2)}
                </Box>
              </Box>
            </Box>
          </Collapse>
        </Box>

        {/* Tab Selection */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => {
              setActiveTab(val);
              setJsonInput('');
              setJsonError(null);
              setLessonsPreview([]);
            }}
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab
              value="paste"
              label={isRtl ? 'لصق النص البرمجي' : 'Paste Code'}
              icon={<ContentPaste sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ textTransform: 'none', fontWeight: 700 }}
            />
            <Tab
              value="upload"
              label={isRtl ? 'رفع ملف JSON' : 'Upload File'}
              icon={<UploadFile sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ textTransform: 'none', fontWeight: 700 }}
            />
          </Tabs>
        </Box>

        {/* Interactive Input Containers */}
        {activeTab === 'paste' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {isRtl ? 'الصق كود الـ JSON هنا:' : 'Paste your JSON array here:'}
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={10}
              value={jsonInput}
              onChange={handleTextChange}
              placeholder={`[\n  {\n    "title": "Introduction",\n    "video_url": "https://youtu.be/0Xx0Hh0Vv"\n }\n{\n    "title": "Core",\n    "video_url": "https://youtu.be/0Xx0Hh0Vv"\n }\n]`}
              error={!!jsonError}
              helperText={jsonError}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                  backgroundColor: 'background.paper',
                  transition: 'border-color 200ms ease',
                  '&:hover fieldset': { borderColor: 'primary.main' },
                },
              }}
            />
          </Box>
        ) : (
          <Box
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              flexShrink: 0,
              border: '2px dashed',
              borderColor: dragActive ? 'primary.main' : 'divider',
              borderRadius: 3,
              p: 4.5,
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: dragActive ? 'action.hover' : 'transparent',
              transition: 'all 200ms ease',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'action.hover',
              },
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              style={{ display: 'none' }}
            />
            <UploadFile sx={{ fontSize: 48, color: 'text.secondary', mb: 1.5, opacity: 0.8 }} />
            <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5 }}>
              {isRtl ? 'اسحب وأفلت ملف الـ JSON هنا' : 'Drag & drop your JSON file here'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {isRtl ? 'أو انقر لتصفح ملفات جهازك' : 'or click to browse your device files'}
            </Typography>
            <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.disabled' }}>
              {isRtl ? 'الملفات المدعومة: .json فقط' : 'Supported formats: .json only'}
            </Typography>
          </Box>
        )}

        {/* Live Validation Alert & Summary */}
        {lessonsPreview.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert
              severity="success"
              icon={<CheckCircle fontSize="inherit" />}
              sx={{ borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
            >
              <Stack
                direction="row"
                flexWrap="wrap"
                justifyContent="space-between"
                alignItems="center"
                gap={1.5}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {isRtl
                    ? `تم تحليل ${lessonsPreview.length} دروس بنجاح! راجعها أدناه قبل الاستيراد.`
                    : `Successfully parsed ${lessonsPreview.length} lessons! Review them below before importing.`}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.85 }}>
                  {isRtl
                    ? `إجمالي المدة: ${formatDuration(lessonsPreview.reduce((sum, item) => sum + item.duration_sec, 0))}`
                    : `Total Duration: ${formatDuration(lessonsPreview.reduce((sum, item) => sum + item.duration_sec, 0))}`}
                </Typography>
              </Stack>
            </Alert>

            {/* Interactive Preview List Manager */}
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              {isRtl ? 'إدارة ومعاينة الدروس المدخلة:' : 'Manage and Preview Input Lessons:'}
            </Typography>

            <Stack
              spacing={2}
              sx={{
                maxHeight: 300,
                overflowY: 'auto',
                pr: 0.5,
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'rgba(0,0,0,0.15)',
                  borderRadius: '4px',
                },
              }}
            >
              {lessonsPreview.map((item, index) => {
                const isValid = item.video_url.trim() !== '' && isValidVideoUrl(item.video_url);

                return (
                  <Card
                    key={item.id}
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: isValid ? 'divider' : 'error.main',
                      backgroundColor: 'background.paper',
                      transition: 'border-color 200ms ease, box-shadow 200ms ease',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      },
                    }}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                      {/* Number Badge */}
                      <Badge
                        badgeContent={item.order_index ?? index + 1}
                        color="primary"
                        sx={{
                          '& .MuiBadge-badge': {
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            position: 'static',
                            transform: 'none',
                          },
                        }}
                      />

                      {/* Interactive Title & URL Fields */}
                      <Stack spacing={1} sx={{ flexGrow: 1, width: '100%' }}>
                        <TextField
                          size="small"
                          fullWidth
                          value={item.title}
                          label={isRtl ? 'عنوان الدرس' : 'Lesson Title'}
                          onChange={(e) =>
                            handleUpdatePreviewLesson(item.id, { title: e.target.value })
                          }
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                        />
                        <TextField
                          size="small"
                          fullWidth
                          error={!isValid}
                          value={item.video_url}
                          label={isRtl ? 'رابط الفيديو' : 'Video URL'}
                          onChange={(e) =>
                            handleUpdatePreviewLesson(item.id, { video_url: e.target.value })
                          }
                          helperText={
                            !isValid &&
                            (isRtl
                              ? 'رابط الفيديو غير صالح أو فارغ!'
                              : 'Video URL is empty or invalid!')
                          }
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                        />
                      </Stack>

                      {/* Toggles & Delete Control */}
                      <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="center"
                        sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
                      >
                        {/* Preview toggle indicator */}
                        <Tooltip title={isRtl ? 'معاينة مجانية' : 'Free Preview'}>
                          <IconButton
                            onClick={() =>
                              handleUpdatePreviewLesson(item.id, { is_preview: !item.is_preview })
                            }
                            color={item.is_preview ? 'primary' : 'default'}
                            size="small"
                          >
                            {item.is_preview ? <Visibility /> : <VisibilityOff />}
                          </IconButton>
                        </Tooltip>

                        {/* Duration Field */}
                        <Box sx={{ minWidth: 60, textAlign: 'center' }}>
                          <Typography variant="caption" display="block" sx={{ fontWeight: 700 }}>
                            {formatDuration(item.duration_sec)}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                          >
                            {isRtl ? 'ثانية' : 'sec'}
                          </Typography>
                        </Box>

                        <Divider orientation="vertical" flexItem />

                        {/* Delete from Preview List */}
                        <Tooltip title={isRtl ? 'حذف من القائمة' : 'Remove from list'}>
                          <IconButton
                            onClick={() => handleRemovePreviewLesson(item.id)}
                            color="error"
                            size="small"
                          >
                            <DeleteOutline />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        )}
      </DialogContent>

      {/* Action Footer */}
      <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider', px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          sx={{ textTransform: 'none', fontWeight: 700, color: 'text.secondary', borderRadius: 2 }}
        >
          {t('cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={lessonsPreview.length === 0 || createLessonsBulk.isPending}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            px: 3,
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          }}
        >
          {createLessonsBulk.isPending ? t('importing') : t('import_lessons_title')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
