import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './app/AppRoutes';
import ScrollToTop from './app/ScrollToTop';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
