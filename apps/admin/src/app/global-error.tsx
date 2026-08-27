'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body>
        <main style={{ fontFamily: 'sans-serif', padding: '3rem', textAlign: 'center' }}>
          <h1>حدث خطأ غير متوقع</h1>
          <p>نعتذر، يرجى المحاولة مرة أخرى.</p>
          <button onClick={() => reset()} type="button">
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
