import type { AnchorHTMLAttributes } from 'react';

/** `next/link` del banco di prova: un semplice link. */
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}
