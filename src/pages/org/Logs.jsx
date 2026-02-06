// Reuse the admin Logs component but with orgDashboard API
import { useState, useEffect } from 'react';
import LogsComponent from '../admin/Logs';
import { orgDashboard } from '../../services/api';
import '../admin/Logs.css'; // Import the CSS

const Logs = () => {
  // Override the API to use orgDashboard instead of adminAPI
  return <LogsComponent apiService={orgDashboard} title="Organization Logs" subtitle="View and filter your organization's activity logs" />;
};

export default Logs;
