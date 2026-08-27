import { localeDirection } from '@/i18n/routing';

export type Direction = 'ltr' | 'rtl';

export function getDir(locale: string): Direction {
  return (localeDirection[locale as keyof typeof localeDirection] as Direction) ?? 'ltr';
}
