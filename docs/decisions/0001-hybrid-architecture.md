# ADR 0001: Architettura ibrida (raccolta sul PC, feed in cloud)

- Stato: accettata
- Data: 14/11/2026
- Decisa da: Damian

## Contesto
Il feed si usa soprattutto dal telefono e ovunque. I contenuti però vanno presi dal portale Epicode, che ha Cloudflare Turnstile sul login, registra l'attività e blocca le reti cloud. Un accesso da un IP di data center sarebbe anomalo.

## Opzioni
1. Tutto sul PC (SQLite, telefono via LAN/Tailscale): zero costi, ma serve il PC acceso.
2. **Ibrida**: un'estensione sul PC importa ciò che lo studente sta già guardando; il feed è una PWA in cloud.
3. App nativa (React Native): doppio lavoro e store, vantaggio minimo.

## Decisione
Opzione 2.

## Conseguenze
- Il traffico verso Epicode resta quello di un uso normale, dal browser dello studente.
- Il feed funziona anche a PC spento.
- Serve un backend cloud (Supabase + Vercel) e quindi cura per sicurezza e permessi (ADR 0002).
