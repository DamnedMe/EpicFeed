/**
 * Banco di prova della sezione *Io* per Playwright: la stessa pagina del
 * server (`src/app/profile/page.tsx`) senza sessione né server action.
 */
import { mount } from './mount';
import { ProfilePage } from './pages';

mount(<ProfilePage />);
