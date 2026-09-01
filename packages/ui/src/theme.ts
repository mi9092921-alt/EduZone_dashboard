'use client';

import { createTheme } from '@mui/material/styles';
import { colors } from './tokens/colors';
import { spacing, borderRadius } from './tokens/spacing';

/**
 * EduZone MUI Theme
 * Colors from EduZone Design Tokens v1
 */
export const eduZoneTheme = createTheme({
  palette: {
    primary: {
      main: colors.primary[700],
      light: colors.primary[400],
      dark: colors.primary[900],
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: colors.primary[500],
      light: colors.primary[300],
      dark: colors.primary[700],
      contrastText: '#FFFFFF',
    },
    error: {
      main: colors.error[500],
    },
    warning: {
      main: colors.warning[500],
    },
    success: {
      main: colors.success[500],
    },
    background: {
      default: 'var(--mui-background)',
      paper: 'var(--mui-paper)',
    },
    text: {
      primary: colors.neutral[900],
      secondary: colors.neutral[500],
    },
    divider: colors.neutral[200],
  },
  typography: {
    fontFamily: "'Inter', 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontSize: '32px', fontWeight: 700, letterSpacing: '-0.5px' },
    h2: { fontSize: '24px', fontWeight: 700, letterSpacing: '-0.25px' },
    h3: { fontSize: '20px', fontWeight: 600 },
    h4: { fontSize: '18px', fontWeight: 600 },
    h5: { fontSize: '16px', fontWeight: 600 },
    h6: { fontSize: '14px', fontWeight: 600 },
    subtitle1: { fontSize: '16px', fontWeight: 600 },
    subtitle2: { fontSize: '14px', fontWeight: 600 },
    body1: { fontSize: '16px', fontWeight: 400 },
    body2: { fontSize: '14px', fontWeight: 400, color: 'text.secondary' },
    caption: { fontSize: '12px', fontWeight: 400, color: 'text.secondary' },
    overline: { fontSize: '11px', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '1.0px' },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '14px' },
  },
  spacing: spacing.unit,
  shape: {
    borderRadius: borderRadius.sm,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        [dir='rtl'] {
          font-size: 110%;
          line-height: 1.8 !important;
        }
        [dir='rtl'] * {
          letter-spacing: 0 !important;
        }
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background-color: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background-color: #CBD5E1;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: #94A3B8;
        }
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '10px 24px',
          fontWeight: 600,
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          },
        },
        sizeSmall: {
          padding: '6px 16px',
        },
        sizeLarge: {
          padding: '14px 32px',
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.xl,
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
          border: `1px solid ${colors.neutral[100]}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        rounded: {
          borderRadius: 16,
        },
        elevation1: {
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
        },
        elevation8: {
          boxShadow: '0 10px 32px -4px rgba(15, 23, 42, 0.1), 0 4px 12px -2px rgba(15, 23, 42, 0.05)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          borderCollapse: 'separate',
          borderSpacing: '0 8px', // Creates physical gaps between table rows
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: `${spacing.md}px ${spacing.lg}px`, 
          borderBottom: 'none', 
          backgroundColor: 'var(--mui-paper)',
          fontSize: '0.875rem',
        },
        head: {
          fontWeight: 700,
          backgroundColor: 'transparent',
          color: colors.neutral[500],
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '0.75rem',
          padding: `${spacing.sm}px ${spacing.lg}px`,
          borderBottom: 'none',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.05)',
          borderRadius: 12, // Round the corners of the entire row
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          // To make borderRadius work on table rows with border-collapse: separate, we target the first and last cells:
          '& td:first-of-type, & th:first-of-type': {
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
          },
          '& td:last-of-type, & th:last-of-type': {
            borderTopRightRadius: 12,
            borderBottomRightRadius: 12,
          },
        },
        hover: {
          '&:hover': {
            backgroundColor: 'action.hover !important',
            boxShadow: '0 8px 20px -4px rgba(15, 23, 42, 0.1)',
            transform: 'translateY(-1px)',
          },
        },
        head: {
          boxShadow: 'none',
          backgroundColor: 'transparent',
          '&:hover': {
            boxShadow: 'none',
            transform: 'none',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        },
      },
      defaultProps: {
        slotProps: {
          backdrop: {
            sx: {
              backdropFilter: 'blur(4px)',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: 'background.default',
          transition: 'box-shadow 200ms ease',
          '& fieldset': {
            borderColor: 'divider',
          },
          '&:hover fieldset': {
            borderColor: '#CBD5E1',
          },
          '&.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.15)',
            '& fieldset': {
              borderColor: '#6366F1',
              borderWidth: '2px',
            },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.md,
          marginTop: spacing.sm,
          border: `1px solid ${colors.neutral[200]}`,
          boxShadow: '0 10px 32px -4px rgba(15, 23, 42, 0.1)',
        },
        list: {
          padding: 8,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '0 4px',
          padding: '10px 16px',
        },
      },
    },
  },
});

/**
 * RTL variant of the light theme.
 * MUI's own components (Menu/Popover positioning, Table cell padding, Dialog
 * transitions, etc.) only mirror correctly when `direction: 'rtl'` is set on
 * the theme — the `<html dir="rtl">` attribute alone only affects native CSS,
 * not MUI's JS-driven layout. Pair this with the `stylis-plugin-rtl` stylis
 * plugin in the emotion cache (see apps/admin ThemeProvider) so that `sx`/
 * `styleOverrides` physical properties (margin-left, padding-right, etc.)
 * are flipped too.
 */
export const eduZoneThemeRtl = createTheme(eduZoneTheme, { direction: 'rtl' });

/** Dark theme variant */
export const eduZoneDarkTheme = createTheme({
  ...eduZoneTheme,
  palette: {
    ...eduZoneTheme.palette,
    mode: 'dark',
    background: {
      default: 'var(--mui-background)',
      paper: 'var(--mui-paper)',
    },
    text: {
      primary: colors.neutral[50],
      secondary: colors.neutral[300],
    },
    divider: colors.neutral[800],
  },
  components: {
    ...eduZoneTheme.components,
    MuiCssBaseline: {
      styleOverrides: `
        [dir='rtl'] {
          font-size: 110%;
          line-height: 1.8 !important;
        }
        [dir='rtl'] * {
          letter-spacing: 0 !important;
        }
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background-color: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background-color: #475569;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: #64748B;
        }
      `,
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
          border: '1px solid #1E293B',
          backgroundImage: 'none',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
          borderBottom: 'none',
          // Use CSS variable so it always matches the dark paper surface
          backgroundColor: 'var(--mui-paper)',
          fontSize: '0.875rem',
        },
        head: {
          fontWeight: 700,
          backgroundColor: 'transparent',
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '0.75rem',
          padding: '8px 24px',
          borderBottom: 'none',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 4px -1px rgba(0, 0, 0, 0.4)',
          borderRadius: 12,
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '& td:first-of-type, & th:first-of-type': {
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
          },
          '& td:last-of-type, & th:last-of-type': {
            borderTopRightRadius: 12,
            borderBottomRightRadius: 12,
          },
        },
        hover: {
          '&:hover': {
            // Dark-appropriate hover: slightly lighter than paper
            backgroundColor: 'rgba(255, 255, 255, 0.05) !important',
            boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.5)',
            transform: 'translateY(-1px)',
          },
          '&:hover td': {
            backgroundColor: 'transparent !important',
          },
        },
        head: {
          boxShadow: 'none',
          backgroundColor: 'transparent',
          '&:hover': {
            boxShadow: 'none',
            transform: 'none',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          transition: 'box-shadow 200ms ease',
          '& fieldset': {
            borderColor: '#334155',
          },
          '&:hover fieldset': {
            borderColor: '#475569',
          },
          '&.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(27, 79, 138, 0.25)',
            '& fieldset': {
              borderColor: '#2E86C1',
              borderWidth: '2px',
            },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          marginTop: 8,
          border: '1px solid #1E293B',
          boxShadow: '0 10px 32px -4px rgba(0, 0, 0, 0.4)',
          backgroundImage: 'none',
        },
        list: {
          padding: 8,
        },
      },
    },
  },
});

/** RTL variant of the dark theme — see {@link eduZoneThemeRtl} for why this exists. */
export const eduZoneDarkThemeRtl = createTheme(eduZoneDarkTheme, { direction: 'rtl' });

