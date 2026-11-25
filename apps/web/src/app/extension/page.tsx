import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { requireUser } from '@/server/auth';
import { getServices } from '@/server/container';
import { ConnectExtension } from './connect-extension';

export const metadata: Metadata = { title: 'Estensione' };
export const dynamic = 'force-dynamic';

/**
 * Collegamento dell'estensione: crea un token di import (valido 30 giorni,
 * solo per importare) e lo consegna all'estensione installata nel browser.
 */
export default async function ExtensionPage() {
  const user = await requireUser();
  const tokens = await getServices().tokens.listActive(user.id);
  return (
    <Shell title="Estensione">
      <ConnectExtension
        extensionId={process.env.NEXT_PUBLIC_EXTENSION_ID ?? ''}
        tokens={tokens.map((token) => ({
          id: token.id,
          label: token.label,
          createdAt: token.createdAt.toISOString(),
          expiresAt: token.expiresAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </Shell>
  );
}
