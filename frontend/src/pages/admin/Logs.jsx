import { useState, useEffect } from 'react';
import {
  FileText,
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  AlertCircle,
  Loader2,
  X,
  Tag,
  User,
  Activity,
  Building2,
  Clock,
  Eye,
  Info,
  Code,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import './Logs.css';

const Logs = ({ apiService = adminAPI, title = 'System Logs', subtitle = 'View and filter system activity logs' }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [dateFilter, setDateFilter] = useState('7days'); // 7days, 1month, 3months, 1year, custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [, setShowCalendar] = useState(false);
  const [actorTypeFilter, setActorTypeFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [selectedLog, setSelectedLog] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, startDate, endDate, actorTypeFilter, actionTypeFilter, entityTypeFilter, pagination.page]);

  const getDateRange = (filter) => {
    const now = new Date();
    const start = new Date();

    switch (filter) {
      case '7days':
        start.setDate(now.getDate() - 7);
        break;
      case '1month':
        start.setMonth(now.getMonth() - 1);
        break;
      case '3months':
        start.setMonth(now.getMonth() - 3);
        break;
      case '1year':
        start.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return { startDate: null, endDate: null };
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError('');

      const filters = {
        page: pagination.page,
        limit: pagination.limit,
      };

      // Apply date filter
      if (dateFilter === 'custom') {
        if (startDate) filters.startDate = new Date(startDate).toISOString();
        if (endDate) {
          // Add one day to include the entire end date
          const endDateObj = new Date(endDate);
          endDateObj.setDate(endDateObj.getDate() + 1);
          filters.endDate = endDateObj.toISOString();
        }
      } else if (dateFilter !== 'all') {
        const dateRange = getDateRange(dateFilter);
        if (dateRange.startDate) filters.startDate = new Date(dateRange.startDate).toISOString();
        if (dateRange.endDate) {
          // Add one day to include the entire end date
          const endDateObj = new Date(dateRange.endDate);
          endDateObj.setDate(endDateObj.getDate() + 1);
          filters.endDate = endDateObj.toISOString();
        }
      }

      // Apply type filters
      if (actorTypeFilter) filters.actorType = actorTypeFilter;
      if (actionTypeFilter) filters.actionType = actionTypeFilter;
      if (entityTypeFilter) filters.entityType = entityTypeFilter;

      const response = await apiService.getLogs(filters);
      setLogs(response.logs || []);
      setPagination(response.pagination || pagination);
    } catch (err) {
      console.error('Failed to load logs:', err);
      setError(err.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const handleDateFilterChange = (filter) => {
    setDateFilter(filter);
    if (filter !== 'custom') {
      setStartDate('');
      setEndDate('');
      setShowCalendar(false);
    } else {
      setShowCalendar(true);
    }
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getActionTypeColor = (actionType) => {
    const colors = {
      Create: 'success',
      Update: 'info',
      Delete: 'danger',
      Login: 'primary',
      Logout: 'secondary',
      View: 'neutral',
      Payment: 'warning',
      Attempt: 'info',
      Verification: 'success',
      Subscription: 'primary',
      ResultGeneration: 'info',
      AIQuestionGeneration: 'primary',
    };
    return colors[actionType] || 'neutral';
  };

  const getActorTypeIcon = (actorType) => {
    switch (actorType) {
      case 'User':
        return <User size={14} />;
      case 'OrgUser':
        return <User size={14} />;
      case 'Organization':
        return <Building2 size={14} />;
      case 'Student':
        return <User size={14} />;
      default:
        return <Activity size={14} />;
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleViewDetails = (log) => {
    setSelectedLog(log);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedLog(null);
  };

  const formatJSON = (data) => {
    if (!data) return null;
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  };

  const exportToCSV = () => {
    if (filteredLogs.length === 0) {
      setError('No logs to export');
      return;
    }

    // Define CSV headers
    const headers = [
      'Log ID',
      'Timestamp',
      'Actor Type',
      'Actor Name',
      'Actor Email',
      'Actor ID',
      'Action Type',
      'Entity Type',
      'Entity ID',
      'Description',
      'IP Address',
      'User Agent',
      'Previous Data',
      'New Data',
    ];

    // Convert logs to CSV rows
    const rows = filteredLogs.map((log) => {
      const previousData = log.PreviousData ? JSON.stringify(log.PreviousData) : '';
      const newData = log.NewData ? JSON.stringify(log.NewData) : '';
      const timestamp = log.Timestamp ? new Date(log.Timestamp).toISOString() : '';

      return [
        log.LogID || '',
        timestamp,
        log.ActorType || '',
        log.ActorName || '',
        log.ActorEmail || '',
        log.ActorID || '',
        log.ActionType || '',
        log.EntityType || '',
        log.EntityID || '',
        (log.Description || '').replace(/"/g, '""'), // Escape quotes
        log.IPAddress || '',
        (log.UserAgent || '').replace(/"/g, '""'), // Escape quotes
        previousData.replace(/"/g, '""'), // Escape quotes
        newData.replace(/"/g, '""'), // Escape quotes
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.map((h) => `"${h}"`).join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    // Generate filename with current date
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    link.setAttribute('download', `system-logs-${dateStr}-${timeStr}.csv`);

    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    if (filteredLogs.length === 0) {
      setError('No logs to export');
      return;
    }

    // Prepare export data
    const exportData = {
      exportDate: new Date().toISOString(),
      totalLogs: filteredLogs.length,
      filters: {
        dateFilter,
        startDate: dateFilter === 'custom' ? startDate : null,
        endDate: dateFilter === 'custom' ? endDate : null,
        actorTypeFilter: actorTypeFilter || null,
        actionTypeFilter: actionTypeFilter || null,
        entityTypeFilter: entityTypeFilter || null,
        searchQuery: searchQuery || null,
      },
      logs: filteredLogs.map((log) => ({
        LogID: log.LogID,
        Timestamp: log.Timestamp,
        ActorType: log.ActorType,
        ActorName: log.ActorName,
        ActorEmail: log.ActorEmail,
        ActorID: log.ActorID,
        ActionType: log.ActionType,
        EntityType: log.EntityType,
        EntityID: log.EntityID,
        Description: log.Description,
        IPAddress: log.IPAddress,
        UserAgent: log.UserAgent,
        PreviousData: log.PreviousData,
        NewData: log.NewData,
      })),
    };

    // Create blob and download
    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    // Generate filename with current date
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    link.setAttribute('download', `system-logs-${dateStr}-${timeStr}.json`);

    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    setShowDownloadMenu(!showDownloadMenu);
  };

  const handleExportCSV = () => {
    exportToCSV();
    setShowDownloadMenu(false);
  };

  const handleExportJSON = () => {
    exportToJSON();
    setShowDownloadMenu(false);
  };

  // Close download menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDownloadMenu && !event.target.closest('.download-dropdown')) {
        setShowDownloadMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDownloadMenu]);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (log.Description || '').toLowerCase().includes(query) ||
      (log.ActorName || '').toLowerCase().includes(query) ||
      (log.ActorEmail || '').toLowerCase().includes(query) ||
      (log.ActionType || '').toLowerCase().includes(query) ||
      (log.EntityType || '').toLowerCase().includes(query) ||
      (log.IPAddress || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="logs-page">
      <div className="page-header">
        <div className="header-content">
          <div className="header-title-section">
            <FileText size={28} />
            <div>
              <h1>{title}</h1>
              <p className="page-subtitle">{subtitle}</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn-icon" onClick={loadLogs} title="Refresh">
              <RefreshCw size={20} />
            </button>
            <div className="download-dropdown">
              <button
                className={`btn-icon ${showDownloadMenu ? 'active' : ''}`}
                title="Export Logs"
                onClick={handleDownload}
              >
                <Download size={20} />
              </button>
              {showDownloadMenu && (
                <div className="download-menu">
                  <button className="download-option" onClick={handleExportCSV}>
                    <Download size={16} />
                    Export as CSV
                  </button>
                  <button className="download-option" onClick={handleExportJSON}>
                    <Download size={16} />
                    Export as JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button className="notice-close" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filters Section */}
      <div className="filters-section">
        <div className="filters-row">
          {/* Date Filter Buttons */}
          <div className="filter-group">
            <label>Time Period</label>
            <div className="date-filter-buttons">
              <button
                className={`filter-btn ${dateFilter === '7days' ? 'active' : ''}`}
                onClick={() => handleDateFilterChange('7days')}
              >
                7 Days
              </button>
              <button
                className={`filter-btn ${dateFilter === '1month' ? 'active' : ''}`}
                onClick={() => handleDateFilterChange('1month')}
              >
                1 Month
              </button>
              <button
                className={`filter-btn ${dateFilter === '3months' ? 'active' : ''}`}
                onClick={() => handleDateFilterChange('3months')}
              >
                3 Months
              </button>
              <button
                className={`filter-btn ${dateFilter === '1year' ? 'active' : ''}`}
                onClick={() => handleDateFilterChange('1year')}
              >
                1 Year
              </button>
              <button
                className={`filter-btn ${dateFilter === 'custom' ? 'active' : ''}`}
                onClick={() => handleDateFilterChange('custom')}
              >
                <Calendar size={16} />
                Custom
              </button>
            </div>
          </div>

          {/* Custom Date Range */}
          {dateFilter === 'custom' && (
            <div className="filter-group calendar-filter">
              <label>Custom Date Range</label>
              <div className="date-inputs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="date-input"
                  max={endDate || new Date().toISOString().split('T')[0]}
                />
                <span className="date-separator">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="date-input"
                  min={startDate}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          )}
        </div>

        <div className="filters-row">
          {/* Search */}
          <div className="filter-group search-group">
            <label>Search</label>
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search logs by description, actor, action..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button className="search-clear" onClick={() => setSearchQuery('')}>
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Actor Type Filter */}
          <div className="filter-group">
            <label>Actor Type</label>
            <select
              value={actorTypeFilter}
              onChange={(e) => {
                setActorTypeFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="filter-select"
            >
              <option value="">All Actors</option>
              <option value="User">User</option>
              <option value="OrgUser">Org User</option>
              <option value="Organization">Organization</option>
              <option value="Student">Student</option>
              <option value="System">System</option>
            </select>
          </div>

          {/* Action Type Filter */}
          <div className="filter-group">
            <label>Action Type</label>
            <select
              value={actionTypeFilter}
              onChange={(e) => {
                setActionTypeFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="filter-select"
            >
              <option value="">All Actions</option>
              <option value="Login">Login</option>
              <option value="Logout">Logout</option>
              <option value="Create">Create</option>
              <option value="Update">Update</option>
              <option value="Delete">Delete</option>
              <option value="View">View</option>
              <option value="Payment">Payment</option>
              <option value="Attempt">Attempt</option>
              <option value="Verification">Verification</option>
              <option value="Subscription">Subscription</option>
              <option value="ResultGeneration">Result Generation</option>
              <option value="AIQuestionGeneration">AI Question Generation</option>
            </select>
          </div>

          {/* Entity Type Filter */}
          <div className="filter-group">
            <label>Entity Type</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="filter-select"
            >
              <option value="">All Entities</option>
              <option value="User">User</option>
              <option value="Organization">Organization</option>
              <option value="Student">Student</option>
              <option value="Test">Test</option>
              <option value="Question">Question</option>
              <option value="Subscription">Subscription</option>
              <option value="Payment">Payment</option>
              <option value="Result">Result</option>
              <option value="System">System</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="logs-table-container">
        {loading ? (
          <div className="loading-state">
            <Loader2 size={32} className="spinner" />
            <p>Loading logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No logs found</h3>
            <p>Try adjusting your filters or date range</p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Description</th>
                    <th>IP Address</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.LogID}>
                      <td>
                        <div className="timestamp-cell">
                          <Clock size={14} />
                          <span>{formatTimestamp(log.Timestamp)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="actor-cell">
                          <div className="actor-icon">{getActorTypeIcon(log.ActorType)}</div>
                          <div className="actor-info">
                            <div className="actor-name">{log.ActorName || 'Unknown'}</div>
                            {log.ActorEmail && (
                              <div className="actor-email">{log.ActorEmail}</div>
                            )}
                            <div className="actor-type-tag">
                              <Tag size={12} />
                              {log.ActorType}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`action-tag action-${getActionTypeColor(log.ActionType)}`}>
                          {log.ActionType}
                        </span>
                      </td>
                      <td>
                        <span className="entity-tag">{log.EntityType || 'N/A'}</span>
                      </td>
                      <td>
                        <div className="description-cell">
                          {log.Description || 'No description'}
                        </div>
                      </td>
                      <td>
                        <div className="ip-cell">{log.IPAddress || 'N/A'}</div>
                      </td>
                      <td>
                        <button
                          className="btn-details"
                          onClick={() => handleViewDetails(log)}
                          title="View details"
                        >
                          <Eye size={14} />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                >
                  <ChevronLeft size={18} />
                  Previous
                </button>
                <div className="pagination-info">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total logs)
                </div>
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Next
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Log Details Modal */}
      {showModal && selectedLog && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-section">
                <Info size={24} />
                <div>
                  <h2>Log Details</h2>
                  <p className="modal-subtitle">Complete information about this log entry</p>
                </div>
              </div>
              <button className="modal-close" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Basic Information */}
              <div className="detail-section">
                <h3 className="detail-section-title">Basic Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Log ID</label>
                    <div className="detail-value code">{selectedLog.LogID}</div>
                  </div>
                  <div className="detail-item">
                    <label>Timestamp</label>
                    <div className="detail-value">
                      <Clock size={14} />
                      {formatTimestamp(selectedLog.Timestamp)}
                    </div>
                  </div>
                  <div className="detail-item">
                    <label>Description</label>
                    <div className="detail-value">{selectedLog.Description || 'No description'}</div>
                  </div>
                </div>
              </div>

              {/* Actor Information */}
              <div className="detail-section">
                <h3 className="detail-section-title">Actor Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Actor Type</label>
                    <div className="detail-value">
                      <span className="entity-tag">{selectedLog.ActorType}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <label>Actor Name</label>
                    <div className="detail-value">{selectedLog.ActorName || 'Unknown'}</div>
                  </div>
                  <div className="detail-item">
                    <label>Actor Email</label>
                    <div className="detail-value">{selectedLog.ActorEmail || 'N/A'}</div>
                  </div>
                  <div className="detail-item">
                    <label>Actor ID</label>
                    <div className="detail-value code">{selectedLog.ActorID}</div>
                  </div>
                </div>
              </div>

              {/* Action Information */}
              <div className="detail-section">
                <h3 className="detail-section-title">Action Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Action Type</label>
                    <div className="detail-value">
                      <span className={`action-tag action-${getActionTypeColor(selectedLog.ActionType)}`}>
                        {selectedLog.ActionType}
                      </span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <label>Entity Type</label>
                    <div className="detail-value">
                      <span className="entity-tag">{selectedLog.EntityType || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <label>Entity ID</label>
                    <div className="detail-value code">{selectedLog.EntityID || 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Technical Information */}
              <div className="detail-section">
                <h3 className="detail-section-title">Technical Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>IP Address</label>
                    <div className="detail-value code">{selectedLog.IPAddress || 'N/A'}</div>
                  </div>
                  <div className="detail-item full-width">
                    <label>User Agent</label>
                    <div className="detail-value code small">{selectedLog.UserAgent || 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Data Changes */}
              {(selectedLog.PreviousData || selectedLog.NewData) && (
                <div className="detail-section">
                  <h3 className="detail-section-title">Data Changes</h3>
                  <div className="data-changes-container">
                    {selectedLog.PreviousData && (
                      <div className="data-change-box">
                        <div className="data-change-header">
                          <Code size={16} />
                          <span>Previous Data</span>
                        </div>
                        <pre className="json-viewer">{formatJSON(selectedLog.PreviousData)}</pre>
                      </div>
                    )}
                    {selectedLog.NewData && (
                      <div className="data-change-box">
                        <div className="data-change-header">
                          <Code size={16} />
                          <span>New Data</span>
                        </div>
                        <pre className="json-viewer">{formatJSON(selectedLog.NewData)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={handleCloseModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Logs;
