import { useNavigate } from 'react-router-dom';
import AdminLoginForm from '../../components/AdminLoginForm';

const AdminLoginPage = () => {
  const navigate = useNavigate();

  const handleLoginSuccess = (response) => {
    const user = response.user;
    if (user?.role === 'SuperAdmin') {
      navigate('/admin/dashboard', { replace: true });
    }
  };

  return <AdminLoginForm onSuccess={handleLoginSuccess} />;
};

export default AdminLoginPage;





