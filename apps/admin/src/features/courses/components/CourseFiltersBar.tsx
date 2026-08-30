'use client';

import { Search, Close, FilterList } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectItem } from '@/components/ui/Select';
import type { CourseFilters } from '@/domain/types/course.types';

interface CourseFiltersBarProps {
  filters: CourseFilters;
  onFiltersChange: (filters: CourseFilters) => void;
  totalCount: number;
}

export function CourseFiltersBar({
  filters,
  onFiltersChange,
  totalCount: _totalCount,
}: CourseFiltersBarProps) {
  const t = useTranslations('common');

  const STATUS_OPTIONS = [
    { value: '', label: t('all_statuses') },
    { value: 'published', label: t('published') },
    { value: 'draft', label: t('draft') },
    { value: 'archived', label: t('archived') },
  ];

  const LEVEL_OPTIONS = [
    { value: '', label: t('all_levels') },
    { value: 'beginner', label: t('beginner') },
    { value: 'intermediate', label: t('intermediate') },
    { value: 'advanced', label: t('advanced') },
  ];

  const PRICING_OPTIONS = [
    { value: '', label: t('all_pricing') },
    { value: 'true', label: t('free') },
    { value: 'false', label: t('paid') },
  ];
  const [searchValue, setSearchValue] = useState(filters.search ?? '');
  const [showFilters, setShowFilters] = useState(false);

  // Debounce effect
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchValue !== (filters.search ?? '')) {
        const newFilters = { ...filters };
        if (searchValue) {
          newFilters.search = searchValue;
        } else {
          delete newFilters.search;
        }
        onFiltersChange(newFilters);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchValue, onFiltersChange, filters]);

  const activeFilterCount = [
    filters.status,
    filters.level,
    filters.is_free !== undefined ? String(filters.is_free) : undefined,
    filters.category,
  ].filter(Boolean).length;

  const clearAllFilters = useCallback(() => {
    setSearchValue('');
    onFiltersChange({});
  }, [onFiltersChange]);

  const updateFilter = <K extends keyof CourseFilters>(key: K, value: CourseFilters[K] | '' | undefined) => {
    const newFilters = { ...filters };
    if (value === '' || value === undefined) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    onFiltersChange(newFilters);
  };

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm mb-6 transition-faang">
      {/* Search Field & Toggle row */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t('search_courses')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="ps-10 h-10 bg-muted/30 border-muted-foreground/10 focus:bg-background"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden h-10 w-10 flex-shrink-0 text-muted-foreground bg-primary/5 border-primary/10 hover:bg-primary/10"
          onClick={() => setShowFilters(!showFilters)}
        >
          <FilterList className="h-5 w-5" />
        </Button>
      </div>

      <div className={`flex flex-wrap items-center gap-3 ${showFilters ? 'flex' : 'hidden lg:flex'}`}>
        {/* Status Filter */}
        <div className="w-full sm:w-[160px]">
          <Select
            className="h-10 text-xs font-medium"
            value={filters.status ?? ''}
            onValueChange={(val) => updateFilter('status', val as CourseFilters['status'] | '')}
          >
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        {/* Level Filter */}
        <div className="w-full sm:w-[160px]">
          <Select
            className="h-10 text-xs font-medium"
            value={filters.level ?? ''}
            onValueChange={(val) => updateFilter('level', val)}
          >
            {LEVEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        {/* Pricing Filter */}
        <div className="w-full sm:w-[160px]">
          <Select
            className="h-10 text-xs font-medium"
            value={filters.is_free !== undefined ? String(filters.is_free) : ''}
            onValueChange={(val) => {
              updateFilter('is_free', val === '' ? undefined : val === 'true');
            }}
          >
            {PRICING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        {/* Clear Actions */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs h-9 px-3 gap-2 bg-primary/5 text-primary hover:bg-primary/10 rounded-full"
          >
            {t('active_filters', { count: activeFilterCount })}
            <Close className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
