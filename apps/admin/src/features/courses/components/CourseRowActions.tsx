'use client';

import {
  MoreVert,
  Visibility,
  Edit,
  Publish,
  Archive,
  Delete,
} from '@mui/icons-material';
import type { Course } from '@/domain/types/course.types';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown';
import { Button } from '@/components/ui/Button';

import { useTranslations } from 'next-intl';

interface CourseRowActionsProps {
  course: Course;
  onView: (course: Course) => void;
  onEdit: (course: Course) => void;
  onPublish: (course: Course) => void;
  onArchive: (course: Course) => void;
  onDelete: (course: Course) => void;
}

export function CourseRowActions({
  course,
  onView,
  onEdit,
  onPublish,
  onArchive,
  onDelete,
}: CourseRowActionsProps) {
  const t = useTranslations('common');

  return (
    <Dropdown
      align="end"
      trigger={
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
          <MoreVert className="text-xl" />
        </Button>
      }
    >
      <DropdownItem 
        onClick={() => onView(course)}
        icon={<Visibility className="text-indigo-500 text-sm" />}
      >
        {t('view_detail')}
      </DropdownItem>
      <DropdownItem 
        onClick={() => onEdit(course)}
        icon={<Edit className="text-amber-500 text-sm" />}
      >
        {t('edit')}
      </DropdownItem>
      
      <DropdownSeparator />
      
      {course.status !== 'published' && (
        <DropdownItem 
          onClick={() => onPublish(course)} 
          className="text-emerald-600 dark:text-emerald-400"
          icon={<Publish className="text-emerald-500 text-sm" />}
        >
          {t('publish')}
        </DropdownItem>
      )}
      {course.status !== 'archived' && (
        <DropdownItem 
          onClick={() => onArchive(course)} 
          className="text-amber-600 dark:text-amber-400"
          icon={<Archive className="text-amber-500 text-sm" />}
        >
          {t('archive')}
        </DropdownItem>
      )}
      
      <DropdownSeparator />
      
      <DropdownItem 
        onClick={() => onDelete(course)} 
        variant="destructive"
        icon={<Delete className="text-red-500 text-sm" />}
      >
        {t('delete')}
      </DropdownItem>
    </Dropdown>
  );
}
