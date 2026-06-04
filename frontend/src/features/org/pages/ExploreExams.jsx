import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  BookOpen,
  FileText,
  AlertCircle,
  Sparkles,
  Package,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Compass,
  Lock,
  UserCheck,
  Layers,
} from 'lucide-react';
import { orgDashboard, orgAuth } from '../../../services/api';
import './OrgStudentExamEnrollments.css';
import './ExploreExams.css';

const TAB_OVERVIEW = 'overview';
const TAB_CATALOG = 'catalog';

const FILTER_ALL = 'all';
const FILTER_IN_PLAN = 'in-plan';
const FILTER_NOT_IN_PLAN = 'not-in-plan';

const PITCH = [
  { icon: Layers, text: 'Exam libraries with subjects and syllabus' },
  { icon: FileText, text: 'Build tests, question banks, and assignments' },
  { icon: UserCheck, text: 'Enroll students per exam from your org portal' },
];

function ExploreSkeleton() {
  return (
    <div className="org-explore-skeleton" aria-busy="true">
      <div className="org-explore-skeleton-bar org-explore-skeleton-bar--tabs" />
      <div className="org-explore-skeleton-bar org-explore-skeleton-bar--search" />
      <div className="org-explore-skeleton-grid" />
    </div>
  );
}

const ExploreExams = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(TAB_CATALOG);
  const [catalogFilter, setCatalogFilter] = useState(FILTER_ALL);
  const [exams, setExams] = useState([]);
  const [subscribedExamIds, setSubscribedExamIds] = useState(new Set());
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const orgLabel = orgAuth.getCurrentUser()?.orgName || 'your organization';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [exploreRes, subExamsRes, subsRes] = await Promise.all([
        orgDashboard.exploreExams(),
        orgDashboard.getSubscriptionExams().catch(() => ({ exams: [] })),
        orgDashboard.getSubscriptions().catch(() => ({ subscriptions: [] })),
      ]);
      setExams(exploreRes.exams || []);
      const subExams = subExamsRes.exams || [];
      setSubscribedExamIds(new Set(subExams.map((e) => e.ExamID)));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const active = (subsRes.subscriptions || []).some((sub) => {
        if (sub.Status?.toLowerCase() !== 'active' || !sub.EndDate) return false;
        const end = new Date(sub.EndDate);
        end.setHours(0, 0, 0, 0);
        return end >= today;
      });
      setHasActiveSubscription(active);
    } catch (err) {
      setError(err.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const inPlan = exams.filter((e) => subscribedExamIds.has(e.ExamID)).length;
    return {
      total: exams.length,
      inPlan,
      notInPlan: exams.length - inPlan,
    };
  }, [exams, subscribedExamIds]);

  const filteredExams = useMemo(() => {
    let list = exams;
    if (catalogFilter === FILTER_IN_PLAN) {
      list = list.filter((e) => subscribedExamIds.has(e.ExamID));
    } else if (catalogFilter === FILTER_NOT_IN_PLAN) {
      list = list.filter((e) => !subscribedExamIds.has(e.ExamID));
    }
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((exam) => {
      const name = (exam.ExamName || '').toLowerCase();
      const desc = (exam.Description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [exams, searchTerm, catalogFilter, subscribedExamIds]);

  if (loading) {
    return (
      <div className="org-ex-enroll-page org-explore-page">
        <div className="page-header org-ex-enroll-header">
          <div>
            <h1>
              <Compass size={28} className="org-ex-enroll-title-icon" aria-hidden />
              Explore exams
            </h1>
            <p className="page-subtitle">Loading exam catalog…</p>
          </div>
        </div>
        <ExploreSkeleton />
      </div>
    );
  }

  return (
    <div className="org-ex-enroll-page org-explore-page">
      <div className="page-header org-ex-enroll-header org-explore-header">
        <div>
          <h1>
            <Compass size={28} className="org-ex-enroll-title-icon" aria-hidden />
            Explore exams
          </h1>
          <p className="page-subtitle">
            Browse the platform exam catalog. Your subscription plan determines which exams{' '}
            {orgLabel} can use for tests and enrollments.
          </p>
        </div>
        <div className="org-explore-header-actions">
          <button
            type="button"
            className="btn-secondary org-explore-icon-btn"
            onClick={loadData}
            aria-label="Refresh catalog"
          >
            <RefreshCw size={16} />
          </button>
          <Link to="/org/subscription-plans" className="btn-secondary org-explore-header-link">
            <Package size={16} />
            Subscription plans
          </Link>
          <Link to="/org/student-exam-enrollments" className="btn-primary org-explore-header-link">
            <UserCheck size={16} />
            Exam enrollments
          </Link>
        </div>
      </div>

      {error && (
        <div className="org-ex-enroll-notice" role="alert">
          <div className="notice warn">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="org-explore-stats">
        <div className="org-explore-stat">
          <span className="org-explore-stat-value">{counts.total}</span>
          <span className="org-explore-stat-label">Exams in catalog</span>
        </div>
        <div className="org-explore-stat org-explore-stat--primary">
          <span className="org-explore-stat-value">{counts.inPlan}</span>
          <span className="org-explore-stat-label">In your plan</span>
        </div>
        <div className="org-explore-stat org-explore-stat--muted">
          <span className="org-explore-stat-value">{counts.notInPlan}</span>
          <span className="org-explore-stat-label">Not in plan</span>
        </div>
        <div
          className={`org-explore-stat org-explore-stat--status ${
            hasActiveSubscription ? 'org-explore-stat--ok' : 'org-explore-stat--warn'
          }`}
        >
          <span className="org-explore-stat-value org-explore-stat-value--text">
            {hasActiveSubscription ? 'Active' : 'None'}
          </span>
          <span className="org-explore-stat-label">Subscription</span>
        </div>
      </div>

      {!hasActiveSubscription && (
        <div className="org-ex-enroll-notice org-explore-sub-banner">
          <div className="notice warn org-explore-sub-notice">
            <Package size={18} />
            <span>
              No active subscription. Subscribe to a plan to unlock exams for tests and student enrollments.{' '}
              <Link to="/org/subscription-plans">View plans</Link>
            </span>
          </div>
        </div>
      )}

      <div className="org-explore-tabs" role="tablist" aria-label="Explore sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_OVERVIEW}
          className={`org-explore-tab ${activeTab === TAB_OVERVIEW ? 'active' : ''}`}
          onClick={() => setActiveTab(TAB_OVERVIEW)}
        >
          <Sparkles size={18} />
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_CATALOG}
          className={`org-explore-tab ${activeTab === TAB_CATALOG ? 'active' : ''}`}
          onClick={() => setActiveTab(TAB_CATALOG)}
        >
          <Search size={18} />
          Exam catalog
          <span className="org-explore-tab-count">{counts.total}</span>
        </button>
      </div>

      {activeTab === TAB_OVERVIEW && (
        <section className="org-ex-enroll-panel org-explore-overview" role="tabpanel">
          <h2>How exam access works</h2>
          <p className="org-ex-enroll-panel-hint">
            Every exam in the catalog is platform-wide. Your organization gets access only to exams included in
            your active subscription plan. Students are enrolled per exam under Exam enrollments.
          </p>
          <ul className="org-explore-benefits">
            {PITCH.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={18} className="org-explore-benefit-icon" aria-hidden />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="org-explore-overview-actions">
            {!hasActiveSubscription && (
              <Link to="/org/subscription-plans" className="btn-primary">
                View subscription plans
                <ArrowRight size={16} />
              </Link>
            )}
            <button type="button" className="btn-secondary" onClick={() => setActiveTab(TAB_CATALOG)}>
              Browse {counts.total} exams
            </button>
            {hasActiveSubscription && counts.inPlan > 0 && (
              <Link to="/org/student-exam-enrollments" className="btn-secondary">
                Manage enrollments
              </Link>
            )}
          </div>
        </section>
      )}

      {activeTab === TAB_CATALOG && (
        <section className="org-explore-catalog" role="tabpanel">
          <div className="org-explore-catalog-toolbar">
            <div className="org-ex-enroll-search org-explore-search">
              <Search size={18} aria-hidden />
              <input
                type="search"
                placeholder="Search by exam name or description…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search exams"
              />
            </div>
            <div className="org-explore-filters" role="group" aria-label="Filter exams">
              <button
                type="button"
                className={`org-explore-filter ${catalogFilter === FILTER_ALL ? 'active' : ''}`}
                onClick={() => setCatalogFilter(FILTER_ALL)}
              >
                All
                <span className="org-explore-filter-count">{counts.total}</span>
              </button>
              <button
                type="button"
                className={`org-explore-filter ${catalogFilter === FILTER_IN_PLAN ? 'active' : ''}`}
                onClick={() => setCatalogFilter(FILTER_IN_PLAN)}
              >
                In your plan
                <span className="org-explore-filter-count">{counts.inPlan}</span>
              </button>
              <button
                type="button"
                className={`org-explore-filter ${catalogFilter === FILTER_NOT_IN_PLAN ? 'active' : ''}`}
                onClick={() => setCatalogFilter(FILTER_NOT_IN_PLAN)}
              >
                Not in plan
                <span className="org-explore-filter-count">{counts.notInPlan}</span>
              </button>
            </div>
          </div>

          {filteredExams.length === 0 ? (
            <div className="org-ex-enroll-panel org-explore-empty">
              <BookOpen size={40} className="org-explore-empty-icon" aria-hidden />
              <h3>{searchTerm ? 'No matching exams' : 'No exams in this view'}</h3>
              <p className="org-ex-enroll-panel-hint">
                {searchTerm
                  ? 'Try a different search term or clear the filter.'
                  : 'Change the filter above or refresh the catalog.'}
              </p>
              {searchTerm && (
                <button type="button" className="btn-secondary" onClick={() => setSearchTerm('')}>
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="org-explore-grid">
              {filteredExams.map((exam) => (
                <ExamCard
                  key={exam.ExamID}
                  exam={exam}
                  inPlan={subscribedExamIds.has(exam.ExamID)}
                  onUnlock={() => navigate('/org/subscription-plans')}
                  onEnrollments={() => navigate('/org/student-exam-enrollments')}
                />
              ))}
            </div>
          )}

          <p className="org-explore-footnote">
            Showing {filteredExams.length} of {exams.length} exams
            {catalogFilter !== FILTER_ALL && ` (filtered)`}
            {searchTerm.trim() && ` matching “${searchTerm.trim()}”`}.
          </p>
        </section>
      )}
    </div>
  );
};

function ExamCard({ exam, inPlan, onUnlock, onEnrollments }) {
  const subjectCount = exam.SubjectCount ?? exam.NoOfSubjects ?? 0;

  return (
    <article className={`org-explore-card ${inPlan ? 'org-explore-card--in-plan' : ''}`}>
      <div className="org-explore-card-top">
        <span className={`org-explore-pill ${inPlan ? 'org-explore-pill--in-plan' : 'org-explore-pill--locked'}`}>
          {inPlan ? (
            <>
              <CheckCircle2 size={12} />
              In your plan
            </>
          ) : (
            <>
              <Lock size={12} />
              Not in plan
            </>
          )}
        </span>
      </div>

      <div className="org-explore-card-icon" aria-hidden>
        <BookOpen size={22} strokeWidth={1.75} />
      </div>

      <h3 className="org-explore-card-title">{exam.ExamName || 'Untitled exam'}</h3>

      {exam.Description ? (
        <p className="org-explore-card-desc">{exam.Description}</p>
      ) : (
        <p className="org-explore-card-desc org-explore-card-desc--muted">No description provided.</p>
      )}

      <ul className="org-explore-card-meta">
        <li>
          <FileText size={14} />
          <span>
            <strong>{subjectCount}</strong> subject{subjectCount === 1 ? '' : 's'}
          </span>
        </li>
        {exam.NoOfSubjects != null && exam.NoOfSubjects !== subjectCount && (
          <li>
            <Layers size={14} />
            <span>{exam.NoOfSubjects} syllabus slots</span>
          </li>
        )}
      </ul>

      <div className="org-explore-card-footer">
        {inPlan ? (
          <button type="button" className="btn-primary org-explore-card-cta" onClick={onEnrollments}>
            <UserCheck size={16} />
            Manage enrollments
          </button>
        ) : (
          <button type="button" className="btn-secondary org-explore-card-cta" onClick={onUnlock}>
            <Package size={16} />
            Unlock via plans
          </button>
        )}
      </div>
    </article>
  );
}

export default ExploreExams;
