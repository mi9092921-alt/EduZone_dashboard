'use client';

import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Select, SelectItem } from '@/components/ui/Select';

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export function TablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: TablePaginationProps) {
  const t = useTranslations('common');
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="px-6 py-2 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-background/50">
      <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{t('rows_per_page')}</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(val: string) => onPageSizeChange(Number(val))}
            aria-label={t('rows_per_page')}
            className="bg-transparent border-none focus-visible:ring-0 shadow-none h-8 py-1 px-2 text-xs font-bold text-foreground cursor-pointer w-[70px] hover:bg-muted/50 rounded-lg"
          >
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={size.toString()}>
                {size}
              </SelectItem>
            ))}
          </Select>
        </div>
        <span>
          {t('showing')} {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)}{' '}
          {t('of')} {totalCount}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label={t('prev')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="text-sm" />
        </Button>
        <div className="flex items-center gap-1">
          {(() => {
            let startPage = Math.max(1, page - 2);
            let endPage = Math.min(Math.max(totalPages, 1), startPage + 4);

            if (endPage - startPage < 4) {
              startPage = Math.max(1, endPage - 4);
            }

            return Array.from({ length: Math.max(0, endPage - startPage + 1) }).map((_, i) => {
              const p = startPage + i;
              return (
                <Button
                  key={p}
                  variant={p === page ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => onPageChange(p)}
                  className="h-8 w-8 p-0 text-xs transition-colors duration-200 shrink-0"
                >
                  {p}
                </Button>
              );
            });
          })()}
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label={t('next')}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="text-sm" />
        </Button>
      </div>
    </div>
  );
}
