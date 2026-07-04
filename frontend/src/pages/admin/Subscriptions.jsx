import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Building2,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  Search,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Users,
  FileText,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import AdminOversightNotice from '../../components/admin/AdminOversightNotice';
import './Subscriptions.css';

const Subscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    loadSubscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, entityTypeFilter, pagination.page]);

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminAPI.getSubscriptions({
        status: statusFilter,
        entityType: entityTypeFilter,
        page: pagination.page,
        limit: pagination.limit,
      });
      setSubscriptions(response.subscriptions || []);
      setPagination(response.pagination || pagination);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setError(err.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (subscriptionId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(subscriptionId)) {
      newExpanded.delete(subscriptionId);
    } else {
      newExpanded.add(subscriptionId);
    }
    setExpandedRows(newExpanded);
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const searchLower = searchTerm.toLowerCase();
    const entityName = sub.entityDetails?.name || '';
    const entityEmail = sub.entityDetails?.email || '';
    const planName = sub.plan?.planName || '';
    return (
      entityName.toLowerCase().includes(searchLower) ||
      entityEmail.toLowerCase().includes(searchLower) ||
      planName.toLowerCase().includes(searchLower) ||
      sub.subscriptionId.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusBadge = (status) => {
    const isActive = status === 'Active';
    return (
      <span className={`status-badge ${isActive ? 'active' : 'inactive'}`}>
        {isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
        <span>{status || 'Unknown'}</span>
      </span>
    );
  };

  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter((sub) => sub.status === 'Active').length,
    expired: subscriptions.filter((sub) => sub.status === 'Expired').length,
    cancelled: subscriptions.filter((sub) => sub.status === 'Cancelled').length,
    organizations: subscriptions.filter((sub) => sub.entityType === 'Organization').length,
    students: subscriptions.filter((sub) => sub.entityType === 'Student').length,
    totalRevenue: subscriptions.reduce((sum, sub) => sum + (sub.totalPaid || 0), 0),
  };

  return (
    <div className="subscriptions-page">
      <div className="page-header">
        <div>
          <h1>Subscriptions & Usage</h1>
          <p className="page-subtitle">Tenant subscription oversight — usage and payment history</p>
        </div>
        <div className="header-actions">
          <div className="filters">
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Expired">Expired</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              className="filter-select"
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPagination({ ...pagination, page: 1 });
              }}
            >
              <option value="all">All Types</option>
              <option value="Organization">Organizations</option>
              <option value="Student">Students</option>
            </select>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search subscriptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <AdminOversightNotice
        title="Oversight only"
        actions={
          <>
            <Link to="/admin/revenue" className="admin-oversight-notice__link">
              Revenue &amp; Payments →
            </Link>
            <Link to="/admin/subscription-plans" className="admin-oversight-notice__link">
              Manage plans →
            </Link>
          </>
        }
      >
        Inspect subscriptions, per-exam usage, and payment rows. Organizations and students subscribe or
        unsubscribe from their own plan pages (simulated checkout writes to Payments). There are no SuperAdmin
        cancel, refund, or billing controls on this screen.
      </AdminOversightNotice>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {/* Stats Summary */}
      <div className="stats-summary">
        <div className="stat-item">
          <span className="stat-label">Total Subscriptions</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Active</span>
          <span className="stat-value active">{stats.active}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Organizations</span>
          <span className="stat-value">{stats.organizations}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Students</span>
          <span className="stat-value">{stats.students}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Revenue</span>
          <span className="stat-value revenue">{formatCurrency(stats.totalRevenue)}</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading subscriptions...</div>
      ) : (
        <>
          <div className="subscriptions-table-container">
            <table className="subscriptions-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Entity</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Usage</th>
                  <th>Payments</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      {searchTerm || statusFilter !== 'all' || entityTypeFilter !== 'all'
                        ? 'No subscriptions found matching your filters'
                        : 'No subscriptions found'}
                    </td>
                  </tr>
                ) : (
                  filteredSubscriptions.map((sub) => {
                    const isExpanded = expandedRows.has(sub.subscriptionId);
                    return (
                      <>
                        <tr key={sub.subscriptionId} className="subscription-row">
                          <td>
                            <button
                              className="expand-btn"
                              onClick={() => toggleRow(sub.subscriptionId)}
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </button>
                          </td>
                          <td>
                            <div className="entity-cell">
                              {sub.entityType === 'Organization' ? (
                                <Building2 size={18} className="entity-icon" />
                              ) : (
                                <User size={18} className="entity-icon" />
                              )}
                              <div>
                                <div className="entity-name">{sub.entityDetails?.name || 'N/A'}</div>
                                <div className="entity-email">{sub.entityDetails?.email || 'N/A'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="plan-cell">
                              <Package size={16} />
                              <span>{sub.plan?.planName || 'N/A'}</span>
                            </div>
                            {sub.plan && (
                              <div className="plan-price">{formatCurrency(sub.plan.price)}</div>
                            )}
                          </td>
                          <td>{getStatusBadge(sub.status)}</td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{formatDate(sub.startDate)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{formatDate(sub.endDate)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="usage-summary">
                              <div className="usage-item">
                                <Users size={12} />
                                <span>{sub.totalUsage?.studentsEnrolled || 0}</span>
                              </div>
                              <div className="usage-item">
                                <FileText size={12} />
                                <span>{sub.totalUsage?.testsCreated || 0}</span>
                              </div>
                              <div className="usage-item">
                                <Zap size={12} />
                                <span>{sub.totalUsage?.questionsCreated || 0}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="payment-info">
                              <DollarSign size={14} />
                              <span>{formatCurrency(sub.totalPaid)}</span>
                              {sub.paymentCount > 0 && (
                                <span className="payment-count">({sub.paymentCount})</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="expanded-row">
                            <td colSpan="8">
                              <div className="expanded-content">
                                {/* Plan Details */}
                                <div className="detail-section">
                                  <h3>Plan Details</h3>
                                  <div className="detail-grid">
                                    <div>
                                      <strong>Plan:</strong> {sub.plan?.planName || 'N/A'}
                                    </div>
                                    <div>
                                      <strong>Price:</strong> {formatCurrency(sub.plan?.price || 0)}
                                    </div>
                                    <div>
                                      <strong>Duration:</strong> {sub.plan?.durationMonths || 0} months
                                    </div>
                                    <div>
                                      <strong>Auto Renew:</strong> {sub.autoRenew ? 'Yes' : 'No'}
                                    </div>
                                    <div>
                                      <strong>Activated At:</strong> {formatDate(sub.activatedAt)}
                                    </div>
                                    <div>
                                      <strong>Created At:</strong> {formatDate(sub.createdAt)}
                                    </div>
                                  </div>
                                </div>

                                {/* Total Usage */}
                                <div className="detail-section">
                                  <h3>Total Usage Statistics</h3>
                                  <div className="usage-grid">
                                    <div className="usage-stat">
                                      <Users size={20} />
                                      <div>
                                        <div className="usage-value">{sub.totalUsage?.studentsEnrolled || 0}</div>
                                        <div className="usage-label">Students Enrolled</div>
                                      </div>
                                    </div>
                                    <div className="usage-stat">
                                      <FileText size={20} />
                                      <div>
                                        <div className="usage-value">{sub.totalUsage?.testsCreated || 0}</div>
                                        <div className="usage-label">Tests Created</div>
                                      </div>
                                    </div>
                                    <div className="usage-stat">
                                      <Zap size={20} />
                                      <div>
                                        <div className="usage-value">{sub.totalUsage?.questionsCreated || 0}</div>
                                        <div className="usage-label">Questions Created</div>
                                      </div>
                                    </div>
                                    <div className="usage-stat">
                                      <TrendingUp size={20} />
                                      <div>
                                        <div className="usage-value">{sub.totalUsage?.aiQuestionsGenerated || 0}</div>
                                        <div className="usage-label">AI Questions</div>
                                      </div>
                                    </div>
                                    <div className="usage-stat">
                                      <Users size={20} />
                                      <div>
                                        <div className="usage-value">{sub.totalUsage?.studentAttempts || 0}</div>
                                        <div className="usage-label">Test Attempts</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Usage by Exam */}
                                {sub.usageByExam && sub.usageByExam.length > 0 && (
                                  <div className="detail-section">
                                    <h3>Usage by Exam</h3>
                                    <div className="usage-by-exam">
                                      {sub.usageByExam.map((examUsage, idx) => (
                                        <div key={idx} className="exam-usage-item">
                                          <div className="exam-name">{examUsage.examName}</div>
                                          <div className="exam-stats">
                                            <span>Students: {examUsage.studentsEnrolled}</span>
                                            <span>Tests: {examUsage.testsCreated}</span>
                                            <span>Questions: {examUsage.questionsCreated}</span>
                                            <span>Attempts: {examUsage.studentAttempts}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Payment History */}
                                {sub.payments && sub.payments.length > 0 && (
                                  <div className="detail-section">
                                    <h3>Payment History</h3>
                                    <div className="payments-list">
                                      {sub.payments.map((payment) => (
                                        <div key={payment.PaymentID} className="payment-item">
                                          <div>
                                            <strong>{formatCurrency(payment.Amount)}</strong>
                                            <span className={`payment-status ${payment.PaymentStatus?.toLowerCase()}`}>
                                              {payment.PaymentStatus}
                                            </span>
                                          </div>
                                          <div className="payment-meta">
                                            <span>{formatDate(payment.PaymentDate)}</span>
                                            <span>{payment.PaymentMethod}</span>
                                            {payment.TransactionID && <span>TX: {payment.TransactionID.substring(0, 8)}...</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page === 1}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                className="pagination-btn"
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Subscriptions;
