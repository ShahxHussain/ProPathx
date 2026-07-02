// Reuse the admin Logs component but with orgDashboard API
import LogsComponent from '../../../pages/admin/Logs';
import { orgDashboard } from '../../../services/api';
import '../../../pages/admin/Logs.css';

const Logs = () => {
  // Override the API to use orgDashboard instead of adminAPI
  return <LogsComponent apiService={orgDashboard} title="Organization Logs" subtitle="View and filter your organization's activity logs" />;
};

export default Logs;
