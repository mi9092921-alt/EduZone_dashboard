'use client';

import {
  Search,
  Download,
  Close,
  FilterList,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectItem } from '@/components/ui/Select';
import type { UserFilters } from '@/domain/types/user.types';
import { cn } from '@/lib/utils';


interface UserFiltersBarProps {
  filters: UserFilters;
  onFiltersChange: (filters: UserFilters) => void;
  totalCount?: number;
  onExport?: () => void;
}

export function UserFiltersBar({
  filters,
  onFiltersChange,
  totalCount: _totalCount,
  onExport,
}: UserFiltersBarProps) {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');

  const ROLE_OPTIONS = [
    { value: '', label: t('all_statuses') }, // Reusing all_statuses for roles generic "All"
    { value: 'super_admin', label: t('role_super_admin') },
    { value: 'admin', label: t('role_admin') },
    { value: 'teacher', label: t('role_teacher') },
    { value: 'student', label: t('role_student') },
  ];

  const STATUS_OPTIONS = [
    { value: '', label: t('all_statuses') },
    { value: 'active', label: t('status_active') },
    { value: 'locked', label: t('status_locked') },
    { value: 'suspended', label: t('status_suspended') },
    { value: 'banned', label: t('status_banned') },
  ];
  const [searchValue, setSearchValue] = useState(filters.search ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearchUpdate = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const next = { ...filters };
        if (value) {
          next.search = value;
        } else {
          delete next.search;
        }
        onFiltersChange(next);
      }, 400);
    },
    [filters, onFiltersChange],
  );

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const updateFilter = <K extends keyof UserFilters>(key: K, value: UserFilters[K] | '') => {
    const next = { ...filters };
    if (value === '' || value === undefined) {
      delete next[key];
    } else {
      next[key] = value as UserFilters[K];
    }
    onFiltersChange(next);
  };

  const clearAll = () => {
    setSearchValue('');
    onFiltersChange({});
  };

  const activeFilterCount = [
    filters.primary_role,
    filters.account_status,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm mb-6 transition-faang">
      {/* Top row: search + action buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t('search_placeholder')}
              value={searchValue}
              onChange={(e) => handleSearchUpdate(e.target.value)}
              className="ps-12 h-10 bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all"
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

        <div className={cn("flex-wrap items-center gap-3", showFilters ? "flex" : "hidden lg:flex")}>
          <div className="w-full sm:w-[160px]">
            <Select
              className="h-10 text-xs font-medium"
              value={filters.primary_role ?? ''}
              onValueChange={(val) => updateFilter('primary_role', (val || undefined) as UserFilters['primary_role'])}
            >
              {ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-[160px]">
            <Select
              className="h-10 text-xs font-medium"
              value={filters.account_status ?? ''}
              onValueChange={(val) => updateFilter('account_status', (val || undefined) as UserFilters['account_status'])}
            >
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-10 gap-2 font-medium px-4"
              onClick={onExport}
            >
              <Download className="text-sm scale-90" />
              {tCommon('export_csv')}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="h-10 text-xs font-bold text-primary hover:bg-primary/5"
              >
                {tCommon('clear_all')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Active filters display (optional, if we want chips even with inline selects) */}
      {(filters.primary_role || filters.account_status) && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground me-1">{tCommon('active_filters', { count: activeFilterCount })}:</span>
          {filters.primary_role && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold">
              {t('primary_role_label')}: {ROLE_OPTIONS.find(o => o.value === filters.primary_role)?.label}
              <button type="button" onClick={() => updateFilter('primary_role', '')} aria-label={tCommon('clear_filter')} className="hover:text-primary/70 transition-faang">
                <Close className="text-[14px]" />
              </button>
            </div>
          )}
          {filters.account_status && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold">
              {t('actions_account_status')}: {STATUS_OPTIONS.find(o => o.value === filters.account_status)?.label}
              <button type="button" onClick={() => updateFilter('account_status', '')} aria-label={tCommon('clear_filter')} className="hover:text-indigo-600/70 transition-faang">
                <Close className="text-[14px]" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
