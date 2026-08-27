import * as React from "react"
import { Select as MuiSelect, MenuItem, MenuItemProps, SelectProps as MuiSelectProps, SelectChangeEvent } from "@mui/material"
import { KeyboardArrowDown } from "@mui/icons-material"
import { cn } from "@/lib/utils"

export interface SelectProps extends Omit<MuiSelectProps, 'onChange'> {
  onValueChange?: (value: string) => void
  className?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, onValueChange, value, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    
    const handleChange = (event: SelectChangeEvent<unknown>) => {
      onValueChange?.(event.target.value as string)
    }

    return (
      <MuiSelect
        ref={ref as any}
        value={value ?? ''}
        onChange={handleChange}
        onOpen={() => setIsOpen(true)}
        onClose={() => setIsOpen(false)}
        displayEmpty
        IconComponent={(p) => (
          <KeyboardArrowDown 
            {...p} 
            className={cn(
              "!end-3 !top-[calc(50%-8px)] !h-4 !w-4 !text-muted-foreground !absolute transition-transform duration-300 ease-in-out pointer-events-none", 
              isOpen && "rotate-180"
            )} 
          />
        )}
        sx={{
          width: '100%',
          minHeight: '2.5rem',
          borderRadius: '0.75rem',
          backgroundColor: 'transparent',
          color: 'hsl(var(--foreground))',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'hsl(var(--border) / 0.5)',
            transition: 'all 0.2s ease',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'hsl(var(--ring) / 0.5)',
            backgroundColor: 'hsl(var(--muted) / 0.05)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: 'hsl(var(--ring))',
            borderWidth: '1.5px',
          },
          '& .MuiSelect-select': {
            padding: '0.625rem 2.5rem 0.625rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            fontSize: 'inherit',
            fontWeight: 'inherit',
            minHeight: 'auto',
          },
          ...((props.sx as any) || {})
        }}
        className={cn("transition-faang text-sm bg-background", className)}
        MenuProps={{
          elevation: 0,
          anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
          transformOrigin: { vertical: 'top', horizontal: 'left' },
          PaperProps: {
            className: "border border-border/50 shadow-2xl overflow-hidden rounded-xl mt-2",
            sx: {
              backgroundColor: 'hsl(var(--card) / 0.95)',
              backdropFilter: 'blur(12px)',
              backgroundImage: 'none',
              boxShadow: 'var(--inner-glow)',
              maxHeight: '300px',
              '&::-webkit-scrollbar': { width: '4px' },
              '&::-webkit-scrollbar-thumb': { 
                backgroundColor: 'hsl(var(--border))', 
                borderRadius: '10px' 
              },
              '& .MuiList-root': { padding: '6px' },
              '& .MuiMenuItem-root': {
                borderRadius: '6px',
                margin: '2px 4px',
                padding: '8px 12px',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'hsl(var(--foreground))',
                transition: 'all 0.15s ease',
                position: 'relative',
                '&:hover': {
                  backgroundColor: 'hsl(var(--muted))',
                },
                '&.Mui-selected': {
                  backgroundColor: 'hsl(var(--primary) / 0.12) !important',
                  color: 'hsl(var(--primary))',
                  fontWeight: 600,
                  '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      height: '60%',
                      width: '3px',
                      borderRadius: '0 4px 4px 0',
                      backgroundColor: 'hsl(var(--primary))'
                  }
                }
              }
            }
          }
        }}
        {...props}
      >
        {children}
      </MuiSelect>
    )
  }
)
Select.displayName = "Select"

/**
 * We must use MenuItem directly as children for MuiSelect to correctly track value/display.
 * SelectItem is now just a wrapper that ensures proper styling via className.
 */
export function SelectItem({ className, ...props }: MenuItemProps) {
  return (
    <MenuItem 
      {...props} 
      className={cn("truncate", className)}
    />
  );
}

export { Select }
