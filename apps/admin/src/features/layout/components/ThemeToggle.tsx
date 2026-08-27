'use client';

import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/Button';
import { LightMode, DarkMode } from '@mui/icons-material';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="w-10 h-10 px-0" aria-label="Toggle theme">
        <span className="w-5 h-5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-10 h-10 px-0 transition-faang"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <LightMode className="text-amber-500" sx={{ fontSize: 20 }} />
      ) : (
        <DarkMode className="text-slate-600" sx={{ fontSize: 20 }} />
      )}
    </Button>
  );
}
