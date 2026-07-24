import { Route } from 'react-router-dom';
import Maintenance from '../../../pages/Maintenance';
import Landing from '../../../pages/landing';
import About from '../../../pages/landing/About';
import Contact from '../../../pages/landing/Contact';
import Product from '../../../pages/landing/Product';
import AuthPage from '../pages/AuthPage';
import { PublicRoute, WelcomePasswordRoute } from './guards';

/** Public / pre-auth routes (landing, login, welcome password, maintenance). */
export function AuthFeatureRoutes() {
  return [
    <Route
      key="home"
      path="/"
      element={
        <PublicRoute>
          <Landing />
        </PublicRoute>
      }
    />,
    <Route
      key="product"
      path="/product"
      element={
        <PublicRoute allowAuthenticated>
          <Product />
        </PublicRoute>
      }
    />,
    <Route
      key="about"
      path="/about"
      element={
        <PublicRoute allowAuthenticated>
          <About />
        </PublicRoute>
      }
    />,
    <Route
      key="contact"
      path="/contact"
      element={
        <PublicRoute allowAuthenticated>
          <Contact />
        </PublicRoute>
      }
    />,
    <Route
      key="login"
      path="/login"
      element={
        <PublicRoute>
          <AuthPage />
        </PublicRoute>
      }
    />,
    <Route key="maintenance" path="/maintenance" element={<Maintenance />} />,
    <Route key="welcome" path="/welcome" element={<WelcomePasswordRoute />} />,
  ];
}
