/**
 * Prerender delle pagine del banco di prova, eseguito in Node da `build.mjs`:
 * produce lo stesso HTML che Next.js manderebbe dal server.
 */
import { renderToString } from 'react-dom/server';
import { feedPreview } from '@/features/feed/model';
import { fixture } from './fixture';
import { AssistantPage, FeedPage, ProfilePage, ReviewPage } from './pages';

/** Anteprima della prima lezione, come `loadFeedPreview` sul server. */
export const preview = feedPreview(fixture);

export const html = {
  feed: () => renderToString(<FeedPage preview={preview} />),
  feedWithCopy: () => renderToString(<FeedPage preview={null} />),
  review: () => renderToString(<ReviewPage syncKey={false} />),
  reviewWithKey: () => renderToString(<ReviewPage syncKey />),
  profile: () => renderToString(<ProfilePage />),
  assistant: () => renderToString(<AssistantPage />),
};
