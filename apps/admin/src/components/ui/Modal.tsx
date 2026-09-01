import { Close } from '@mui/icons-material';
import * as React from 'react';

import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string | undefined;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  fullScreen?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-7xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
  className,
  fullScreen = false,
}: ModalProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        className={cn(
          'relative w-full bg-card border border-border shadow-2xl flex flex-col animate-in zoom-in-95 duration-200',
          fullScreen
            ? 'fixed inset-0 h-screen max-h-screen rounded-none border-none'
            : 'rounded-2xl max-h-[90vh] ' + maxWidthClasses[maxWidth],
          'xs:fixed xs:inset-0 xs:h-screen xs:max-h-screen xs:rounded-none md:relative md:rounded-2xl md:max-h-[90vh]',
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="space-y-1">
            {title && <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>}
            {description && (
              <p className="text-sm text-muted-foreground font-medium">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-muted-foreground hover:bg-muted transition-faang"
          >
            <Close className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-6 border-t border-border/50 bg-muted/20 flex items-center justify-end gap-3 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
