import { Route } from 'react-router-dom';
import NotFound from '../pages/NotFound';

/** Catch-all for nested portal routes (e.g. `/org/bad-path`). */
export function NotFoundRoute() {
  return <Route path="*" element={<NotFound />} />;
}
