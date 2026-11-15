import { redirect } from 'next/navigation';

/** La home per ora porta a "Le mie lezioni"; il feed arriva con M3. */
export default function Home() {
  redirect('/lezioni');
}
