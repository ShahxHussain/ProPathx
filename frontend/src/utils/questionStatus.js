export const QUESTION_STATUS = Object.freeze({
  DRAFT: 'Draft',
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
});

export function resolveQuestionStatus(question) {
  if (!question) return QUESTION_STATUS.PENDING;
  const raw = question.Status ?? question.status;
  if (raw && Object.values(QUESTION_STATUS).includes(raw)) {
    return raw;
  }
  if (question.isVerified === true || question.IsVerified === true) {
    return QUESTION_STATUS.VERIFIED;
  }
  if (question.reviewerComments || question.ReviewerComments) {
    return QUESTION_STATUS.REJECTED;
  }
  if (raw === 'verified' || raw === 'approved') return QUESTION_STATUS.VERIFIED;
  if (raw === 'draft') return QUESTION_STATUS.DRAFT;
  if (raw === 'pending') return QUESTION_STATUS.PENDING;
  if (raw === 'rejected') return QUESTION_STATUS.REJECTED;
  return QUESTION_STATUS.PENDING;
}

export function statusToApiSlug(question) {
  const resolved = resolveQuestionStatus(question);
  const map = {
    [QUESTION_STATUS.DRAFT]: 'draft',
    [QUESTION_STATUS.PENDING]: 'pending',
    [QUESTION_STATUS.VERIFIED]: 'verified',
    [QUESTION_STATUS.REJECTED]: 'rejected',
  };
  return map[resolved] || 'pending';
}

export function statusLabel(question) {
  const resolved = resolveQuestionStatus(question);
  const labels = {
    [QUESTION_STATUS.DRAFT]: 'Draft',
    [QUESTION_STATUS.PENDING]: 'Pending',
    [QUESTION_STATUS.VERIFIED]: 'Verified',
    [QUESTION_STATUS.REJECTED]: 'Rejected',
  };
  return labels[resolved] || 'Pending';
}

export function isVerifiedStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.VERIFIED;
}

export function isDraftStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.DRAFT;
}

export function isPendingStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.PENDING;
}

export function isRejectedStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.REJECTED;
}
