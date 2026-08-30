import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // Provide a static locale, fetch from a database, etc.
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

// Force Turbopack cache invalidation for the new generic video_url translation keys
