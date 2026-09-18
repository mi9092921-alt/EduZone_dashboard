import * as React from 'react';

import { cn } from '@/lib/utils';

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onCheckedChange(!checked)}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onCheckedChange(!checked);
        }
      }}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer select-none rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background',
        checked ? 'bg-primary' : 'bg-muted-foreground/50',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
        )}
      />
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
        {...props}
      />
    </div>
  );
}
