import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Imposta la password' };

export default async function PasswordPage() {
  const user = await getCurrentUser({ verifyWithServer: true });
  if (!user) redirect('/accedi');

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {user.hasPassword ? 'Cambia la password' : 'Imposta una password'}
        </h1>
        <p className="text-sm text-muted">
          Dalla prossima volta entrerai con {user.email} e questa password. Il codice via email
          resta per il recupero.
        </p>
      </div>
      <PasswordForm />
    </main>
  );
}
