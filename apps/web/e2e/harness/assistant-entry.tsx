/**
 * Banco di prova di *Io › Assistente* per Playwright: la stessa pagina del
 * server (`src/app/profile/assistant/page.tsx`) senza sessione.
 */
import { mount } from './mount';
import { AssistantPage } from './pages';

mount(<AssistantPage />);
