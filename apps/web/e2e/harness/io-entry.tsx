/**
 * Banco di prova della sezione *Io* per Playwright: la stessa pagina del
 * server (`src/app/io/page.tsx`) senza sessione né server action.
 */
import { mount } from './mount';
import { IoPage } from './pages';

mount(<IoPage />);
