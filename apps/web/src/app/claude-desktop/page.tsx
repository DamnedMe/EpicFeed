import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { requireUser } from '@/server/auth';
import { getServices } from '@/server/container';
import { ConnectClaudeDesktop } from './connect-claude-desktop';

export const metadata: Metadata = { title: 'Claude Desktop' };
export const dynamic = 'force-dynamic';

/** Una settimana: da qui in poi la pagina avvisa che il token sta per scadere. */
const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

/** Dice se un token scade entro una settimana. */
function expiresWithinAWeek(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() < EXPIRY_WARNING_MS;
}

/**
 * Collegamento del server MCP di Claude Desktop (M2, ADR 0013): crea un token
 * "genera" valido 90 giorni, da incollare una volta nelle impostazioni
 * dell'estensione EpicFeed di Claude Desktop.
 */
export default async function ClaudeDesktopPage() {
  const user = await requireUser();
  const tokens = await getServices().generateTokens.listActive(user.id);
  return (
    <Shell title="Claude Desktop">
      <ConnectClaudeDesktop
        tokens={tokens.map((token) => ({
          id: token.id,
          label: token.label,
          expiresAt: token.expiresAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          expiringSoon: expiresWithinAWeek(token.expiresAt),
        }))}
      />
    </Shell>
  );
}
