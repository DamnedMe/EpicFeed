import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Accedi' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { errore } = await searchParams;
  const user = await getCurrentUser({ verifyWithServer: true });
  if (user) redirect(user.hasPassword ? '/lessons' : '/login/password');

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4">
      <div className="flex flex-col gap-2">
        <p className="font-display text-3xl font-bold tracking-tight">
          Epic<span className="text-accent-text">Feed</span>
        </p>
        <p className="text-sm text-muted">Le tue lezioni Epicode, una scheda alla volta.</p>
      </div>
      {errore === 'link' && (
        <p role="alert" className="text-sm text-accent-text">
          Il link non è valido o è scaduto. Richiedilo di nuovo e aprilo nello stesso browser.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
