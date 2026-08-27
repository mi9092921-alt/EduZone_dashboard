'use client';

import { useState, useRef } from 'react';
import { useCreateCourse, useCreateSection, useCreateLessons } from '@/adapters/mutations/courses.mutations';
import { useRouter } from '@/i18n/routing';
import { useToast } from '@/adapters/stores/toast.store';
import { useTranslations, useLocale } from 'next-intl';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Upload, ContentCopy, CheckCircle, ErrorOutline, HelpOutline } from '@mui/icons-material';

interface ImportCourseDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  summary?: {
    title: string;
    sectionsCount: number;
    lessonsCount: number;
  };
}

const TEMPLATE_JSON = {
  course: {
    title: "UI/UX Fundamentals",
    description: "Design thinking and Figma basics.",
    thumbnail_url: "https://example.com/thumbnail.png",
    slug: "ui-ux-fundamentals",
    category: "Design",
    level: "beginner",
    price: 0,
    status: "draft"
  },
  sections: [
    {
      "title": "01. Introduction",
      "order_index": 1,
      "lessons": [
        {
          "title": "Ocular 1",
          "video_url": "https://youtu.be/0bX9vHKPgX8",
          "order_index": 1,
          "is_preview": true,
          "duration_sec": 1637
        }
      ]
    }
  ]
};

export function ImportCourseDialog({ open, onClose }: ImportCourseDialogProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const router = useRouter();
  const { showToast } = useToast();
  
  const createCourse = useCreateCourse();
  const createSection = useCreateSection();
  const createLessons = useCreateLessons();

  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [jsonText, setJsonText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [showSchema, setShowSchema] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateCourseJSON = (text: string): ValidationResult => {
    if (!text.trim()) {
      return { isValid: false, errors: [t('import_course.error_empty_json')] };
    }

    try {
      const data = JSON.parse(text);
      const errors: string[] = [];

      if (!data.course || typeof data.course !== 'object') {
        errors.push(t('import_course.error_missing_course_object'));
      } else {
        if (!data.course.title) {
          errors.push(t('import_course.error_missing_course_title'));
        }
        if (data.course.thumbnail_url) {
          const thumbLower = data.course.thumbnail_url.toLowerCase();
          const isValidThumb = thumbLower.endsWith('.jpg') || 
                               thumbLower.endsWith('.jpeg') || 
                               thumbLower.endsWith('.png') || 
                               thumbLower.endsWith('.webp');
          if (!isValidThumb) {
            errors.push(t('import_course.error_invalid_thumbnail_url'));
          }
        }
        if (data.course.slug) {
          const slugRegex = /^[a-zA-Z0-9-]+$/;
          if (!slugRegex.test(data.course.slug)) {
            errors.push(t('import_course.error_invalid_slug'));
          }
        }
      }

      if (data.sections && !Array.isArray(data.sections)) {
        errors.push(t('import_course.error_sections_not_array'));
      }

      let totalLessons = 0;
      if (data.sections && Array.isArray(data.sections)) {
        data.sections.forEach((sec: any, sIdx: number) => {
          if (!sec.title) {
            errors.push(t('import_course.error_section_missing_title', { index: sIdx + 1 }));
          }
          if (sec.lessons) {
            if (!Array.isArray(sec.lessons)) {
              errors.push(t('import_course.error_lessons_not_array', { title: sec.title || (sIdx + 1) }));
            } else {
              totalLessons += sec.lessons.length;
              sec.lessons.forEach((les: any, lIdx: number) => {
                if (!les.title) {
                  errors.push(t('import_course.error_lesson_missing_title', { index: lIdx + 1, title: sec.title || (sIdx + 1) }));
                }
                if (!les.video_url) {
                  errors.push(t('import_course.error_lesson_missing_video_url', { index: lIdx + 1, title: sec.title || (sIdx + 1) }));
                }
              });
            }
          }
        });
      }

      if (errors.length > 0) {
        return { isValid: false, errors };
      }

      setParsedData(data);
      return {
        isValid: true,
        errors: [],
        summary: {
          title: data.course.title,
          sectionsCount: data.sections?.length || 0,
          lessonsCount: totalLessons
        }
      };
    } catch (e) {
      return { isValid: false, errors: [t('import_course.error_invalid_json_format')] };
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonText(val);
    if (val.trim()) {
      setValidation(validateCourseJSON(val));
    } else {
      setValidation(null);
      setParsedData(null);
    }
  };

  const processFile = async (file: File) => {
    try {
      const text = await file.text();
      setJsonText(text);
      const res = validateCourseJSON(text);
      setValidation(res);
    } catch (err) {
      setValidation({ isValid: false, errors: [t('import_course.error_cannot_read_file')] });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/json") {
      processFile(file);
    } else {
      setValidation({ isValid: false, errors: [t('import_course.error_json_only')] });
    }
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(JSON.stringify(TEMPLATE_JSON, null, 2));
    showToast(t('import_course.toast_copied_template'), 'success');
  };

  const handleImport = async () => {
    if (!validation?.isValid || !parsedData) return;

    try {
      setIsImporting(true);
      setImportStatus(t('import_course.status_creating_structure'));

      // 1. Create Course
      const newCourse = await createCourse.mutateAsync({
        title: parsedData.course.title,
        description: parsedData.course.description || '',
        category: parsedData.course.category || '',
        level: parsedData.course.level || 'beginner',
        price: parsedData.course.price || 0,
        thumbnail_url: parsedData.course.thumbnail_url || undefined,
        status: parsedData.course.status || 'draft',
        slug: parsedData.course.slug || undefined,
      });

      // 2. Create Sections and Lessons
      if (parsedData.sections && Array.isArray(parsedData.sections)) {
        for (let sIdx = 0; sIdx < parsedData.sections.length; sIdx++) {
          const sec = parsedData.sections[sIdx];
          setImportStatus(t('import_course.status_inserting_section', {
            title: sec.title || (sIdx + 1),
            current: sIdx + 1,
            total: parsedData.sections.length
          }));
          
          const newSec = await createSection.mutateAsync({
            courseId: newCourse.id,
            data: {
              title: sec.title || `Section ${sIdx + 1}`,
              order_index: sec.order_index ?? sec.order ?? sIdx,
            }
          });

          if (sec.lessons && Array.isArray(sec.lessons)) {
            const lessonsData = sec.lessons.map((les: any, lIdx: number) => ({
              title: les.title || `Lesson ${lIdx + 1}`,
              video_url: les.video_url || '',
              order_index: les.order_index ?? les.order ?? lIdx,
              duration_sec: les.duration_sec || les.duration || 0,
              is_preview: les.is_preview ?? false,
            }));

            await createLessons.mutateAsync({
              sectionId: newSec.id,
              courseId: newCourse.id,
              data: lessonsData,
            });
          }
        }
      }

      setImportStatus(t('import_course.status_import_completed'));
      showToast(t('import_course.toast_import_success'), 'success');
      
      // Cleanup & Redirect
      setTimeout(() => {
        onClose();
        router.push(`/courses/${newCourse.id}`);
      }, 800);

    } catch (err: any) {
      console.error(err);
      showToast(err.message || t('import_course.toast_import_error'), 'error');
      setImportStatus('');
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      setJsonText('');
      setValidation(null);
      setParsedData(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('import_course.title')}
      maxWidth="md"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isImporting}
            className="font-semibold text-muted-foreground"
          >
            {t('import_course.btn_cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!validation?.isValid || isImporting}
            className="min-w-[120px] bg-primary text-white font-semibold hover:shadow-lg transition-all duration-300"
          >
            {isImporting ? t('import_course.btn_importing') : t('import_course.btn_start_import')}
          </Button>
        </>
      }
    >
      <div className="space-y-5 relative" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Progress Overlay during import */}
        {isImporting && (
          <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-4 rounded-xl border border-border/50 animate-fade-in">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute w-8 h-8 bg-primary/10 rounded-full animate-ping"></div>
            </div>
            <p className="text-lg font-bold text-foreground animate-pulse text-center">{importStatus}</p>
            <p className="text-xs text-muted-foreground">{t('import_course.warning_dont_close')}</p>
          </div>
        )}

        {/* Instructions Section (Expandable/Collapsible Toggle) */}
        <div className="border border-border/60 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-all flex items-center justify-between text-xs font-bold text-foreground"
          >
            <span>{t('import_course.instructions_toggle_title')}</span>
            <span className="text-[10px] text-primary">
              {showInstructions ? t('import_course.hide') : t('import_course.show')}
            </span>
          </button>
          
          {showInstructions && (
            <div className="p-4 bg-muted/10 border-t border-border/40 space-y-3 animate-in slide-in-from-top-1 duration-200">
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                <div className="flex items-start gap-3">
                  <HelpOutline className="text-primary mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-primary">{t('import_course.instructions_title')}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t('import_course.instructions_desc')}
                    </p>
                  </div>
                </div>
                <div className={`border-t border-primary/10 pt-2 text-xs space-y-1 text-muted-foreground ${isRtl ? 'pr-8' : 'pl-8'}`}>
                  <p className="font-bold text-foreground">{t('import_course.guidelines_title')}</p>
                  <ul className="list-disc list-inside space-y-1 mt-1 pr-1">
                    <li>{t('import_course.guideline_level')}</li>
                    <li>{t('import_course.guideline_duration')}</li>
                    <li>{t('import_course.guideline_video_url')}</li>
                    <li>{t('import_course.guideline_thumbnail_url')}</li>
                    <li>{t('import_course.guideline_slug')}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs switcher */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px ${
              activeTab === 'upload'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('import_course.tab_upload')}
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px ${
              activeTab === 'paste'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('import_course.tab_paste')}
          </button>
        </div>

        {/* Tab contents */}
        {activeTab === 'upload' ? (
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 ${
              dragActive
                ? 'border-primary bg-primary/5 scale-[0.99] shadow-inner'
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Upload />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-foreground">{t('import_course.drag_drop_zone')}</p>
              <p className="text-xs text-muted-foreground">{t('import_course.browse_files')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="paste-json">{t('import_course.paste_json_label')}</Label>
            <textarea
              id="paste-json"
              rows={8}
              value={jsonText}
              onChange={handleTextChange}
              placeholder='{\n  "course": {\n    "title": "Course Title",\n    ...\n  }\n}'
              className="font-mono text-xs flex w-full rounded-xl border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-300"
              dir="ltr"
            />
          </div>
        )}

        {/* Validation Results UI */}
        {validation && (
          <div className={`p-4 rounded-xl border animate-in fade-in-50 duration-300 ${
            validation.isValid
              ? 'bg-success/5 border-success/20 text-success'
              : 'bg-destructive/5 border-destructive/20 text-destructive'
          }`}>
            <div className="flex items-start gap-2.5">
              {validation.isValid ? (
                <>
                  <CheckCircle className="text-success mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <h5 className="text-sm font-bold">{t('import_course.ready_to_import')}</h5>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>✓ {t('import_course.summary_course')} <span className="font-semibold text-foreground">{validation.summary?.title}</span></p>
                      <p>✓ {t('import_course.summary_sections')} <span className="font-semibold text-foreground">{validation.summary?.sectionsCount}</span></p>
                      <p>✓ {t('import_course.summary_lessons')} <span className="font-semibold text-foreground">{validation.summary?.lessonsCount}</span></p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <ErrorOutline className="text-destructive mt-0.5 shrink-0" />
                  <div className="space-y-1 flex-1">
                    <h5 className="text-sm font-bold">{t('import_course.found_structural_errors')}</h5>
                    <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 mt-1 pr-1 leading-relaxed">
                      {validation.errors.map((err, idx) => (
                        <li key={idx} className="text-destructive font-medium">{err}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Schema Template Section */}
        <div className="border border-border/60 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSchema(!showSchema)}
            className="w-full px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-all flex items-center justify-between text-xs font-bold text-foreground"
          >
            <span>{t('import_course.schema_template_title')}</span>
            <span className="text-[10px] text-primary">
              {showSchema ? t('import_course.hide') : t('import_course.show')}
            </span>
          </button>
          
          {showSchema && (
            <div className="p-4 bg-muted/10 border-t border-border/40 space-y-3 animate-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{t('import_course.use_template_base')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyTemplate}
                  className="h-7 text-[10px] px-2.5 rounded-lg border-border hover:bg-background gap-1"
                >
                  <ContentCopy sx={{ fontSize: 12 }} />
                  <span>{t('import_course.copy_template')}</span>
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-black text-[10px] text-green-400 font-mono overflow-x-auto max-h-[160px]" dir="ltr">
                {JSON.stringify(TEMPLATE_JSON, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
