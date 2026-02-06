import { useEffect, useState } from 'react';
import { Building2, Mail, Phone, MapPin, Calendar, CheckCircle, XCircle, Search, Edit, Trash2 } from 'lucide-react';
import { adminAPI } from '../../services/api';
import './Organizations.css';

const Organizations = () => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingOrg, setEditingOrg] = useState(null);
  const [deletingOrg, setDeletingOrg] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminAPI.getOrganizations();
      setOrganizations(response.organizations || []);
    } catch (err) {
      console.error('Failed to load organizations:', err);
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrganizations = organizations.filter((org) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (org.OrgName || '').toLowerCase().includes(searchLower) ||
      (org.OrgEmail || '').toLowerCase().includes(searchLower) ||
      (org.Phone || '').toLowerCase().includes(searchLower) ||
      (org.Address || '').toLowerCase().includes(searchLower)
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

  const getStatusBadge = (status) => {
    const isActive = status === 'Active';
    return (
      <span className={`status-badge ${isActive ? 'active' : 'inactive'}`}>
        {isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
        <span>{status || 'Unknown'}</span>
      </span>
    );
  };

  const handleEdit = (org) => {
    setEditingOrg(org);
    setEditFormData({
      orgName: org.OrgName || '',
      orgEmail: org.OrgEmail || '',
      phone: org.Phone || '',
      address: org.Address || '',
      status: org.Status || 'Active',
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setError('');

    try {
      await adminAPI.updateOrganization(editingOrg.OrgID, editFormData);
      setEditingOrg(null);
      setEditFormData({});
      await loadOrganizations();
    } catch (err) {
      setError(err.message || 'Failed to update organization');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingOrg) return;

    setDeleteLoading(true);
    setError('');

    try {
      await adminAPI.deleteOrganization(deletingOrg.OrgID);
      setDeletingOrg(null);
      await loadOrganizations();
    } catch (err) {
      setError(err.message || 'Failed to delete organization');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="organizations-page">
      <div className="page-header">
        <div>
          <h1>Organizations</h1>
          <p className="page-subtitle">Manage all registered organizations</p>
        </div>
        <div className="header-actions">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search organizations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading organizations...</div>
      ) : (
        <>
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-label">Total Organizations</span>
              <span className="stat-value">{organizations.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Active</span>
              <span className="stat-value active">
                {organizations.filter((org) => org.Status === 'Active').length}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Inactive</span>
              <span className="stat-value inactive">
                {organizations.filter((org) => org.Status === 'Inactive').length}
              </span>
            </div>
          </div>

          <div className="organizations-table-container">
            <table className="organizations-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrganizations.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      {searchTerm ? 'No organizations found matching your search' : 'No organizations found'}
                    </td>
                  </tr>
                ) : (
                  filteredOrganizations.map((org) => (
                    <tr key={org.OrgID}>
                      <td>
                        <div className="org-name-cell">
                          <Building2 size={18} className="org-icon" />
                          <span className="org-name">{org.OrgName || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="email-cell">
                          <Mail size={14} />
                          <span>{org.OrgEmail || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="phone-cell">
                          <Phone size={14} />
                          <span>{org.Phone || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="address-cell">
                          <MapPin size={14} />
                          <span>{org.Address || 'N/A'}</span>
                        </div>
                      </td>
                      <td>{getStatusBadge(org.Status)}</td>
                      <td>
                        <div className="date-cell">
                          <Calendar size={14} />
                          <span>{formatDate(org.CreatedAt)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-icon btn-edit"
                            onClick={() => handleEdit(org)}
                            title="Edit organization"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => setDeletingOrg(org)}
                            title="Delete organization"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit Organization Modal */}
      {editingOrg && (
        <div className="modal-overlay" onClick={() => setEditingOrg(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Organization</h2>
              <button className="modal-close" onClick={() => setEditingOrg(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-group">
                <label>
                  Organization Name *
                  <input
                    type="text"
                    value={editFormData.orgName}
                    onChange={(e) => setEditFormData({ ...editFormData, orgName: e.target.value })}
                    required
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Email *
                  <input
                    type="email"
                    value={editFormData.orgEmail}
                    onChange={(e) => setEditFormData({ ...editFormData, orgEmail: e.target.value })}
                    required
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Phone
                  <input
                    type="tel"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Address
                  <input
                    type="text"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Status *
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    required
                    disabled={editLoading}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingOrg(null)} disabled={editLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={editLoading}>
                  {editLoading ? 'Updating...' : 'Update Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingOrg && (
        <div className="modal-overlay" onClick={() => setDeletingOrg(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Organization</h2>
              <button className="modal-close" onClick={() => setDeletingOrg(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete <strong>{deletingOrg.OrgName}</strong> ({deletingOrg.OrgEmail})?
              </p>
              <p className="warning-text">This action cannot be undone. The organization must have no users before it can be deleted.</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeletingOrg(null)} disabled={deleteLoading}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? 'Deleting...' : 'Delete Organization'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;



