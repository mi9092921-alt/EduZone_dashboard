import { Menu, MenuItem, Divider, MenuItemProps } from '@mui/material';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { getDir } from '@/lib/direction';
import { cn } from '@/lib/utils';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

export function Dropdown({ trigger, children, align = 'end', className }: DropdownProps) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const locale = useLocale();
  const isRtl = getDir(locale) === 'rtl';
  const open = Boolean(anchorEl);


  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  // MUI's Menu/Popover positions itself using literal 'left'/'right' and does
  // NOT read theme.direction to flip them — so the logical `align` prop has
  // to be resolved to a physical side here, by hand, based on the current
  // document direction. Without this, "end" always resolves to 'right' and
  // the menu opens off the wrong (and on narrow RTL layouts, off-screen) side.
  const physicalHorizontal: 'left' | 'right' =
    isRtl ? (align === 'end' ? 'left' : 'right') : (align === 'end' ? 'right' : 'left')

  return (
    <>
      <div onClick={handleClick} className="inline-block cursor-pointer">
        {trigger}
      </div>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: physicalHorizontal,
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: physicalHorizontal,
        }}
        slotProps={{
          paper: {
            className: cn(
              'mt-2 min-w-[200px] rounded-xl border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150',
              className,
            ),
            sx: {
              boxShadow: 'var(--inner-glow)',
              backgroundImage: 'none',
              backgroundColor: 'hsl(var(--card) / 0.95)',
              backdropFilter: 'blur(12px)',
              color: 'hsl(var(--foreground))',
              '& .MuiList-root': { padding: '6px' },
              '&::-webkit-scrollbar': { width: '4px' },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'hsl(var(--border))',
                borderRadius: '10px',
              },
              zIndex: 9999,
            },
          },
        }}
        disablePortal={false}
      >
        {children}
      </Menu>
    </>
  );
}

interface DropdownItemProps extends MenuItemProps {
  variant?: 'default' | 'destructive';
  icon?: React.ReactNode;
}

export function DropdownItem({
  children,
  icon,
  variant = 'default',
  className,
  ...props
}: DropdownItemProps) {
  return (
    <MenuItem
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer outline-none select-none my-0.5 mx-1',
        variant === 'destructive'
          ? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
          : 'text-foreground hover:bg-muted focus:bg-muted',
        className,
      )}
      sx={{
        '&.MuiMenuItem-root': {
          borderRadius: '8px',
          margin: '1px 4px',
          transition: 'all 0.15s ease',
          color: 'inherit',
        },
      }}
      {...props}
    >
      {icon && (
        <span className="flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{children}</span>
    </MenuItem>
  );
}

export function DropdownSeparator() {
  return <Divider className="my-1 border-border/50 opacity-50" />;
}
