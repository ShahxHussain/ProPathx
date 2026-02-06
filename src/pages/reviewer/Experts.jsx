import { useEffect, useState } from 'react';
import { TrendingUp, CheckCircle, XCircle, BarChart3, Clock } from 'lucide-react';
import { reviewerAPI } from '../../services/api';
import './Experts.css';

const Experts = () => {
  const [experts, setExperts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadExperts();
  }, []);

  // Auto-dismiss error messages
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadExperts = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await reviewerAPI.getExpertsPerformance();
      setExperts(response.experts || []);
    } catch (err) {
      console.error('Failed to load expert data:', err);
      setError(err.message || 'Failed to load expert data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="experts-page">
      <div className="page-header">
        <h1>Expert Performance</h1>
        <p className="page-subtitle">Monitor and analyze Subject Expert performance metrics</p>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading expert data...</div>
      ) : experts.length === 0 ? (
        <div className="empty-state">
          <BarChart3 size={48} />
          <h3>No expert data</h3>
          <p>Expert performance data will appear here</p>
        </div>
      ) : (
        <div className="experts-grid">
          {experts.map((expert) => (
            <div key={expert.id} className="expert-card">
              <div className="expert-header">
                <div className="expert-avatar">{expert.name.charAt(0).toUpperCase()}</div>
                <div className="expert-info">
                  <h3>{expert.name}</h3>
                  <p>{expert.email}</p>
                  <span className="expert-type">{expert.type} Expert</span>
                </div>
              </div>

              <div className="expert-stats">
                <div className="stat-item">
                  <div className="stat-icon">
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <div className="stat-value">{expert.totalQuestions}</div>
                    <div className="stat-label">Total Questions</div>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-icon stat-icon-success">
                    <CheckCircle size={18} />
                  </div>
                  <div>
                    <div className="stat-value">{expert.approved}</div>
                    <div className="stat-label">Approved</div>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-icon stat-icon-danger">
                    <XCircle size={18} />
                  </div>
                  <div>
                    <div className="stat-value">{expert.rejected}</div>
                    <div className="stat-label">Rejected</div>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-icon stat-icon-warning">
                    <Clock size={18} />
                  </div>
                  <div>
                    <div className="stat-value">{expert.pending}</div>
                    <div className="stat-label">Pending</div>
                  </div>
                </div>
              </div>

              <div className="expert-performance">
                <div className="performance-header">
                  <span>Approval Rate</span>
                  <span className="performance-value">{expert.approvalRate}%</span>
                </div>
                <div className="performance-bar">
                  <div
                    className="performance-fill"
                    style={{ width: `${expert.approvalRate}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Experts;
