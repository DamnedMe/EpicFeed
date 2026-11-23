/** `next/navigation` del banco di prova: la navigazione cambia solo l'indirizzo. */
export function useRouter() {
  return {
    push: (href: string) => {
      window.history.pushState(null, '', href);
    },
  };
}
