'use client';

import { School, Lock, ErrorOutline as AlertCircle } from '@mui/icons-material';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { useAuthStore } from '@/adapters/stores/auth.store';
import { recordCurrentSessionAction } from '@/application/actions/session.actions';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { getBrowserSessionId } from '@/infrastructure/auth/browserSession';
import { createBrowserClient } from '@/infrastructure/supabase/client';

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setUser = useAuthStore((s) => s.setUser);

  const reasonMessages: Record<string, string> = {
    session_invalidated: 'Your session has been invalidated. Please log in again.',
    maintenance_mode: 'The system is currently under maintenance.',
    account_locked: 'Your account has been locked. Contact your administrator.',
    unauthorized: 'You are not authorized to access this resource.',
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? 'Invalid email or password. Please try again.'
            : authError.message,
        );
        return;
      }

      const { data: accessResult, error: accessError } =
        await supabase.rpc('check_dashboard_access');
      if (accessError) {
        setError('Failed to verify account access. Please try again.');
        return;
      }

      if (!accessResult?.allowed) {
        const reason = accessResult?.reason;
        if (reason === 'account_banned') setError('Your account has been permanently banned.');
        else if (reason === 'account_locked')
          setError('Your account is locked. Contact your administrator.');
        else if (reason === 'account_suspended') {
          const until = accessResult?.until;
          setError(
            `Your account is suspended${until ? ` until ${new Date(until).toLocaleString()}` : ''}.`,
          );
        } else if (reason === 'maintenance_mode')
          setError(accessResult?.message || 'System is under maintenance.');
        else setError('Access denied.');
        await supabase.auth.signOut();
        return;
      }

      const sessionId = getBrowserSessionId();
      if (sessionId) {
        const sessionResult = await recordCurrentSessionAction(sessionId);
        if (!sessionResult.success && sessionResult.active === false) {
          setError('Your session has been invalidated. Please log in again.');
          await supabase.auth.signOut();
          return;
        }
      }

      setUser({
        id: authData.user!.id,
        email: authData.user!.email || '',
        primary_role: accessResult.role,
        tenant_id: accessResult.tenant_id,
        token_version: 0,
        permissions: [],
      });

      router.push('/');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background p-6">
      <Card className="w-full max-w-[440px] shadow-2xl border-border/50 animate-in fade-in zoom-in-95 duration-500">
        <CardHeader className="text-center space-y-1 pb-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20 mb-4 transition-faang hover:scale-105">
            <School className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">EduZone Admin</CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign in to your administration panel
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {reason && reasonMessages[reason] && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm animate-in slide-in-from-top-2 duration-300">
              <Lock className="h-4 w-4" />
              <p>{reasonMessages[reason]}</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in shake duration-300">
              <AlertCircle className="h-4 w-4" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@eduzone.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs font-medium text-primary hover:underline transition-faang"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={isLoading || !email || !password}
              size="lg"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </CardContent>

        <div className="p-6 pt-0 text-center">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            EduZone Admin Control v0.1.0
          </p>
        </div>
      </Card>
    </div>
  );
}
