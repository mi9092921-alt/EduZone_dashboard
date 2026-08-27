import type { Preview } from '@storybook/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import rtlPlugin from 'stylis-plugin-rtl';
import { prefixer } from 'stylis';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import enMessages from '../messages/en.json';
import '../src/app/globals.css';

// Create rtl cache
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

// Basic MUI Theme (RTL enabled)
const theme = createTheme({
  direction: 'rtl',
  typography: {
    fontFamily: 'var(--font-cairo), sans-serif',
  },
});

// Initialize MSW
initialize();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
    // Chromatic visual regression settings
    chromatic: { 
      pauseAnimationAtEnd: true, 
      delay: 300 // Slight delay to let fonts/MUI load
    },
    // Background toggles for testing Glassmorphism
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#f9fafb',
        },
        {
          name: 'dark',
          value: '#111827',
        },
        {
          name: 'mesh-gradient',
          value: 'linear-gradient(135deg, #f3e7e9 0%, #e3eeff 99%, #e3eeff 100%)',
        },
      ],
    },
  },
  loaders: [mswLoader],
  decorators: [
    (Story) => (
      <CacheProvider value={cacheRtl}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider locale="en" messages={enMessages}>
              <div dir="rtl">
                <Story />
              </div>
            </NextIntlClientProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </CacheProvider>
    ),
  ],
};

export default preview;
