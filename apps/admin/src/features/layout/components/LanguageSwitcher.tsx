'use client';

import { Translate } from '@mui/icons-material';
import { useLocale } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { useRouter, usePathname } from '@/i18n/routing';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname(); // locale-stripped path from @/i18n/routing

  function toggleLanguage() {
    const nextLocale = locale === 'en' ? 'ar' : 'en';
    // Pass the locale option — next-intl rewrites the URL correctly
    router.push(pathname, { locale: nextLocale });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 transition-faang"
    >
      <Translate className="text-sm" />
      <span className="font-medium uppercase">{locale === 'en' ? 'عربي' : 'EN'}</span>
    </Button>
  );
}
