#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { apiFromEnv, credentialsFromEnv } from './config.js';
import { createEpicFeedServer } from './server.js';
import { defaultSlidesToolkit } from './feed/slides/toolkit.js';

/**
 * Avvio del server MCP di EpicFeed su stdio: Claude Desktop lo lancia come
 * processo figlio e gli parla su stdin/stdout. Nessuna porta di rete aperta.
 * I log vanno su stderr (stdout è riservato al protocollo) e non contengono
 * mai il token, la password né i contenuti delle lezioni.
 */
const server = createEpicFeedServer(
  apiFromEnv(process.env),
  defaultSlidesToolkit(),
  credentialsFromEnv(process.env),
);
await server.connect(new StdioServerTransport());
process.stderr.write('EpicFeed MCP avviato\n');
