import { Suspense } from 'react';
import { LoginPage } from '@/features/auth';

export default function LoginRoute() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
