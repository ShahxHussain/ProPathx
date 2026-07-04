import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, Loader2, User, BookOpen } from 'lucide-react';
import LaTeXRenderer from '../../components/latex/LaTeXRenderer';

const QuestionViewModal = ({
  questionData,
  loadingDetail = false,
  onClose,
  onApprove,
  onReject,
  showRejectButton = false,
}) => {
  if (!questionData) return null;

  const { question, options = [], creator } = questionData;

  return createPortal(
    <div className="modal-overlay question-view-overlay" onClick={onClose}>
      <div
        className="modal-content question-view-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-view-title"
      >
        <div className="question-view-modal__header">
          <div>
            <p className="question-view-modal__kicker">Question review</p>
            <h2 id="question-view-title">Full question preview</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="question-view-modal__meta">
          {question.DifficultyLevel && (
            <span className={`review-badge review-badge--${question.DifficultyLevel.toLowerCase()}`}>
              {question.DifficultyLevel}
            </span>
          )}
          {question.QuestionType && (
            <span className="review-badge review-badge--type">{question.QuestionType}</span>
          )}
          {question.ExamName && <span className="review-badge">{question.ExamName}</span>}
          {question.SubjectName && <span className="review-badge">{question.SubjectName}</span>}
          {question.TopicName && <span className="review-badge">{question.TopicName}</span>}
        </div>

        <div className="question-view-modal__body">
          <section className="question-view-panel question-view-panel--span-all">
            <h3>
              <BookOpen size={18} />
              Question
            </h3>
            <div className="question-view-panel__content question-text-display question-text-display--large">
              <LaTeXRenderer text={question.QuestionText} />
            </div>
          </section>

          <section className="question-view-panel question-view-panel--span-all">
            <h3>Answer options</h3>
            {loadingDetail && options.length === 0 ? (
              <div className="question-view-loading">
                <Loader2 size={20} className="spin" />
                <span>Loading options…</span>
              </div>
            ) : (
              <div className="options-list options-list--large">
                {options.map((option, index) => (
                  <div
                    key={option.OptionID || index}
                    className={`option-item ${option.IsCorrect ? 'correct' : ''}`}
                  >
                    <span className="option-number">{String.fromCharCode(65 + index)}.</span>
                    <span className="option-text">
                      <LaTeXRenderer text={option.OptionText} />
                    </span>
                    {option.IsCorrect && <span className="option-badge">Correct</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {question.Explanation && (
            <section className="question-view-panel question-view-panel--span-all">
              <h3>Explanation</h3>
              <div className="question-view-panel__content explanation-display">
                <LaTeXRenderer text={question.Explanation} />
              </div>
            </section>
          )}

          <section className="question-view-panel question-view-panel--compact">
            <h3>Details</h3>
            <div className="detail-grid">
              {(question.ChapterNumber != null || question.ChapterName) && (
                <div>
                  <strong>Chapter</strong>
                  <span>{[question.ChapterNumber, question.ChapterName].filter(Boolean).join(' — ')}</span>
                </div>
              )}
              <div>
                <strong>Submitted</strong>
                <span>{new Date(question.CreatedAt).toLocaleString()}</span>
              </div>
              {question.VerifiedAt && (
                <div>
                  <strong>Reviewed</strong>
                  <span>{new Date(question.VerifiedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </section>

          <section className="question-view-panel question-view-panel--compact">
            <h3>
              <User size={18} />
              Created by
            </h3>
            {loadingDetail && !creator ? (
              <div className="question-view-loading question-view-loading--inline">
                <Loader2 size={16} className="spin" />
                <span>Loading author…</span>
              </div>
            ) : creator ? (
              <p className="creator-line">
                {creator.name} · {creator.email} · {creator.type}
              </p>
            ) : (
              <p className="creator-line creator-line--muted">Author information unavailable</p>
            )}
          </section>

          {question.ReviewerComments && (
            <section className="question-view-panel question-view-panel--span-all">
              <h3>Rejection comments</h3>
              <div className="rejection-comments">{question.ReviewerComments}</div>
            </section>
          )}
        </div>

        <div className="question-view-modal__footer">
          {showRejectButton && (
            <>
              <button type="button" className="btn-approve" onClick={() => onApprove(question.QuestionID)}>
                <CheckCircle size={18} />
                <span>Approve</span>
              </button>
              <button
                type="button"
                className="btn-reject"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
              >
                <XCircle size={18} />
                <span>Reject</span>
              </button>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuestionViewModal;
