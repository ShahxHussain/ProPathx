import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './app/AppRoutes';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
