import { useState, useEffect } from 'react';
import { Search, BookOpen, Building2, Calendar, FileText, AlertCircle } from 'lucide-react';
import { orgDashboard } from '../../services/api';
import './ExploreExams.css';

const ExploreExams = () => {
  const [exams, setExams] = useState([]);
  const [filteredExams, setFilteredExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    // Filter exams based on search term
    if (!searchTerm.trim()) {
      setFilteredExams(exams);
    } else {
      const searchLower = searchTerm.toLowerCase();
      const filtered = exams.filter((exam) => {
        const examName = (exam.ExamName || '').toLowerCase();
        const description = (exam.Description || '').toLowerCase();
        const orgName = (exam.OrgName || '').toLowerCase();
        const syllabus = (exam.Syllabus || '').toLowerCase();
        
        return (
          examName.includes(searchLower) ||
          description.includes(searchLower) ||
          orgName.includes(searchLower) ||
          syllabus.includes(searchLower)
        );
      });
      setFilteredExams(filtered);
    }
  }, [searchTerm, exams]);

  const loadExams = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await orgDashboard.exploreExams();
      setExams(response.exams || []);
      setFilteredExams(response.exams || []);
    } catch (err) {
      console.error('Failed to load exams:', err);
      setError(err.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="explore-exams-page">
      <div className="page-header">
        <h1>Explore Exams</h1>
        <p className="page-subtitle">Browse and search all available exams</p>
      </div>

      {error && (
        <div className="notice error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search exams by name, description, organization, or syllabus..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {searchTerm && (
          <div className="search-results-count">
            {filteredExams.length} {filteredExams.length === 1 ? 'exam' : 'exams'} found
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state">Loading exams...</div>
      ) : (
        <>
          {filteredExams.length === 0 ? (
            <div className="empty-state">
              <BookOpen size={48} />
              <h3>No exams found</h3>
              <p>
                {searchTerm
                  ? 'Try adjusting your search terms'
                  : 'No exams are available at the moment'}
              </p>
            </div>
          ) : (
            <div className="exams-grid">
              {filteredExams.map((exam) => (
                <div key={exam.ExamID} className="exam-card">
                  <div className="exam-card-header">
                    <div className="exam-icon">
                      <BookOpen size={24} />
                    </div>
                    <div className="exam-title-section">
                      <h3 className="exam-name">{exam.ExamName}</h3>
                      {exam.OrgName && (
                        <div className="exam-org">
                          <Building2 size={14} />
                          <span>{exam.OrgName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {exam.Description && (
                    <p className="exam-description">{exam.Description}</p>
                  )}

                  <div className="exam-details">
                    <div className="exam-detail-item">
                      <FileText size={16} />
                      <span>
                        {exam.SubjectCount || 0} {exam.SubjectCount === 1 ? 'Subject' : 'Subjects'}
                      </span>
                    </div>
                    {exam.NoOfSubjects && (
                      <div className="exam-detail-item">
                        <span className="detail-label">Expected:</span>
                        <span>{exam.NoOfSubjects} subjects</span>
                      </div>
                    )}
                    <div className="exam-detail-item">
                      <Calendar size={16} />
                      <span>{formatDate(exam.CreatedAt)}</span>
                    </div>
                  </div>

                  {exam.Syllabus && (
                    <div className="exam-syllabus">
                      <strong>Syllabus:</strong>
                      <p>{exam.Syllabus}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExploreExams;



