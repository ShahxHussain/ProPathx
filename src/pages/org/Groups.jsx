import { useEffect, useState } from 'react';
import { Plus, Search, UsersRound, X, Edit, Trash2, UserPlus, UserMinus, AlertCircle } from 'lucide-react';
import { groupAPI, studentAPI } from '../../services/api';
import './Groups.css';

const CreateGroupModal = ({ onClose, onSuccess, group = null }) => {
  const isEditMode = !!group;
  const [formData, setFormData] = useState({
    groupName: group?.GroupName || '',
    description: group?.Description || '',
    status: group?.Status || 'Active',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEditMode) {
        await groupAPI.updateGroup(group.GroupID, formData);
      } else {
        await groupAPI.createGroup(formData);
      }
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      setError(err.message || err.details || `Failed to ${isEditMode ? 'update' : 'create'} group`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditMode ? 'Edit Group' : 'Create Group'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Group Name *</span>
              <input
                type="text"
                value={formData.groupName}
                onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                placeholder="e.g., Batch 2024, Section A"
                required
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Description</span>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description for this group"
                rows="3"
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Status *</span>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          {error && (
            <div className="notice error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Group' : 'Create Group')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ManageMembersModal = ({ group, onClose, onSuccess }) => {
  const [students, setStudents] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, [group?.GroupID]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [studentsRes, groupRes] = await Promise.all([
        studentAPI.getStudents({ limit: 1000 }),
        groupAPI.getGroupDetails(group.GroupID),
      ]);

      setStudents(studentsRes.students || []);
      setGroupMembers(groupRes.group.members || []);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMembers = async (studentIds) => {
    try {
      setAdding(true);
      setError('');
      await groupAPI.addMembersToGroup(group.GroupID, studentIds);
      await loadData();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || err.details || 'Failed to add members');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (studentId) => {
    if (!window.confirm('Are you sure you want to remove this student from the group?')) {
      return;
    }

    try {
      setRemoving(true);
      setError('');
      await groupAPI.removeMemberFromGroup(group.GroupID, studentId);
      await loadData();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || err.details || 'Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  const memberStudentIds = new Set(groupMembers.map(m => m.StudentID || m.Students?.StudentID));
  const availableStudents = students.filter(s => !memberStudentIds.has(s.StudentID));
  const filteredAvailable = availableStudents.filter(s =>
    s.FullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.Email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [selectedStudents, setSelectedStudents] = useState([]);

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleAddSelected = () => {
    if (selectedStudents.length === 0) {
      setError('Please select at least one student');
      return;
    }
    handleAddMembers(selectedStudents);
    setSelectedStudents([]);
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Manage Members: {group?.GroupName}</h2>
            <button className="btn-icon" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="loading-state">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Members: {group?.GroupName}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="members-management">
          {error && (
            <div className="notice error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="members-sections">
            {/* Current Members */}
            <div className="members-section">
              <h3>Current Members ({groupMembers.length})</h3>
              {groupMembers.length === 0 ? (
                <div className="empty-members">No members in this group</div>
              ) : (
                <div className="members-list">
                  {groupMembers.map((member) => {
                    const student = member.Students || member;
                    return (
                      <div key={student.StudentID} className="member-item">
                        <div className="member-info">
                          <div className="member-avatar">{student.FullName?.charAt(0) || 'S'}</div>
                          <div>
                            <div className="member-name">{student.FullName || 'N/A'}</div>
                            <div className="member-email">{student.Email || 'N/A'}</div>
                          </div>
                        </div>
                        <button
                          className="btn-icon-small btn-danger"
                          onClick={() => handleRemoveMember(student.StudentID)}
                          disabled={removing}
                          title="Remove from group"
                        >
                          <UserMinus size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Available Students */}
            <div className="members-section">
              <h3>Available Students ({filteredAvailable.length})</h3>
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {filteredAvailable.length === 0 ? (
                <div className="empty-members">No available students</div>
              ) : (
                <>
                  <div className="members-list selectable">
                    {filteredAvailable.map((student) => (
                      <div
                        key={student.StudentID}
                        className={`member-item ${selectedStudents.includes(student.StudentID) ? 'selected' : ''}`}
                        onClick={() => toggleStudentSelection(student.StudentID)}
                      >
                        <div className="member-info">
                          <div className="member-avatar">{student.FullName?.charAt(0) || 'S'}</div>
                          <div>
                            <div className="member-name">{student.FullName || 'N/A'}</div>
                            <div className="member-email">{student.Email || 'N/A'}</div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.StudentID)}
                          onChange={() => toggleStudentSelection(student.StudentID)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ))}
                  </div>
                  {selectedStudents.length > 0 && (
                    <button
                      className="btn-primary"
                      onClick={handleAddSelected}
                      disabled={adding}
                    >
                      <UserPlus size={16} />
                      Add Selected ({selectedStudents.length})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [managingGroup, setManagingGroup] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    loadGroups();
  }, [page, searchTerm]);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await groupAPI.getGroups({
        page,
        limit: 20,
        search: searchTerm || undefined,
      });
      setGroups(response.groups || []);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setShowCreateModal(true);
  };

  const handleDelete = async (group) => {
    if (!window.confirm(`Are you sure you want to delete "${group.GroupName}"? This will remove all members from the group.`)) {
      return;
    }

    try {
      await groupAPI.deleteGroup(group.GroupID);
      loadGroups();
    } catch (error) {
      alert(error.message || error.details || 'Failed to delete group');
    }
  };

  const handleManageMembers = (group) => {
    setManagingGroup(group);
  };

  return (
    <div className="groups-page">
      <div className="page-header">
        <div>
          <h1>Student Groups</h1>
          <p className="page-subtitle">Organize students into groups for easier management</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => {
            setEditingGroup(null);
            setShowCreateModal(true);
          }}>
            <Plus size={18} />
            <span>Create Group</span>
          </button>
        </div>
      </div>

      <div className="groups-filters">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search groups by name or description..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <UsersRound size={48} />
          <h3>No groups found</h3>
          <p>Create your first student group to get started</p>
          <button className="btn-primary" onClick={() => {
            setEditingGroup(null);
            setShowCreateModal(true);
          }}>
            <Plus size={18} />
            <span>Create Group</span>
          </button>
        </div>
      ) : (
        <>
          <div className="groups-grid">
            {groups.map((group) => (
              <div key={group.GroupID} className="group-card">
                <div className="group-card-header">
                  <div className="group-icon">
                    <UsersRound size={24} />
                  </div>
                  <div className="group-actions">
                    <button
                      className="btn-icon-small"
                      onClick={() => handleManageMembers(group)}
                      title="Manage members"
                    >
                      <UserPlus size={16} />
                    </button>
                    <button
                      className="btn-icon-small"
                      onClick={() => handleEdit(group)}
                      title="Edit group"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon-small btn-danger"
                      onClick={() => handleDelete(group)}
                      title="Delete group"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="group-card-body">
                  <h3>{group.GroupName}</h3>
                  {group.Description && (
                    <p className="group-description">{group.Description}</p>
                  )}
                  <div className="group-stats">
                    <div className="stat-item">
                      <UsersRound size={16} />
                      <span>{group.memberCount || 0} members</span>
                    </div>
                    <div className="stat-item">
                      <span className={`status-badge status-${group.Status?.toLowerCase()}`}>
                        {group.Status || 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="group-card-footer">
                  <button
                    className="btn-secondary btn-full"
                    onClick={() => handleManageMembers(group)}
                  >
                    <UserPlus size={16} />
                    Manage Members
                  </button>
                </div>
              </div>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateGroupModal
          group={editingGroup}
          onClose={() => {
            setShowCreateModal(false);
            setEditingGroup(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingGroup(null);
            loadGroups();
          }}
        />
      )}

      {managingGroup && (
        <ManageMembersModal
          group={managingGroup}
          onClose={() => setManagingGroup(null)}
          onSuccess={() => {
            loadGroups();
          }}
        />
      )}
    </div>
  );
};

export default Groups;
