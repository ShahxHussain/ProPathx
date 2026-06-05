import { Route } from 'react-router-dom';
import Maintenance from '../../../pages/Maintenance';
import Landing from '../../../pages/landing';
import AuthPage from '../pages/AuthPage';
import { PublicRoute, WelcomePasswordRoute } from './guards';

/** Public / pre-auth routes (landing, login, welcome password, maintenance). */
export function AuthFeatureRoutes() {
  return (
    <>
      <Route
        path="/"
        element={
          <PublicRoute>
            <Landing />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route path="/maintenance" element={<Maintenance />} />
      <Route path="/welcome" element={<WelcomePasswordRoute />} />
    </>
  );
}
