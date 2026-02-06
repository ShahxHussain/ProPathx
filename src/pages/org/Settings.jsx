import { Settings as SettingsIcon } from 'lucide-react';
import './Settings.css';

const Settings = () => {
  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
        <p className="page-subtitle">Manage your organization settings</p>
      </div>

      <div className="empty-state">
        <SettingsIcon size={48} />
        <h3>Settings</h3>
        <p>Settings management features coming soon</p>
      </div>
    </div>
  );
};

export default Settings;





