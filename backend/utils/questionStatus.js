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
  if (question.IsVerified === true) return QUESTION_STATUS.VERIFIED;
  if (question.ReviewerComments) return QUESTION_STATUS.REJECTED;
  return QUESTION_STATUS.PENDING;
}

export function statusToApiSlug(status) {
  const resolved =
    typeof status === 'string' && Object.values(QUESTION_STATUS).includes(status)
      ? status
      : typeof status === 'object' && status !== null
        ? resolveQuestionStatus(status)
        : resolveQuestionStatus({ Status: status });
  const map = {
    [QUESTION_STATUS.DRAFT]: 'draft',
    [QUESTION_STATUS.PENDING]: 'pending',
    [QUESTION_STATUS.VERIFIED]: 'verified',
    [QUESTION_STATUS.REJECTED]: 'rejected',
  };
  return map[resolved] || 'pending';
}

export function parseStatusFilterInput(input) {
  if (!input || input === 'all') return null;
  const s = String(input).trim().toLowerCase();
  if (s === 'draft') return QUESTION_STATUS.DRAFT;
  if (s === 'pending') return QUESTION_STATUS.PENDING;
  if (s === 'verified' || s === 'approved') return QUESTION_STATUS.VERIFIED;
  if (s === 'rejected') return QUESTION_STATUS.REJECTED;
  return null;
}

export function isVerifiedStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.VERIFIED;
}

export function isPendingStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.PENDING;
}

export function isRejectedStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.REJECTED;
}

export function isDraftStatus(question) {
  return resolveQuestionStatus(question) === QUESTION_STATUS.DRAFT;
}

export function buildStatusFields(status, options = {}) {
  const { reviewerComments, verifiedBy, submittedAt } = options;
  const row = { Status: status };

  if (status === QUESTION_STATUS.VERIFIED) {
    row.IsVerified = true;
    row.ReviewerComments = null;
    if (verifiedBy !== undefined) row.VerifiedBy = verifiedBy;
    row.VerifiedAt = new Date().toISOString();
    return row;
  }

  row.IsVerified = false;

  if (status === QUESTION_STATUS.REJECTED) {
    row.ReviewerComments = reviewerComments ?? null;
    if (verifiedBy !== undefined) row.VerifiedBy = verifiedBy;
    row.VerifiedAt = new Date().toISOString();
  } else {
    row.ReviewerComments = null;
    row.VerifiedBy = null;
    row.VerifiedAt = null;
  }

  if (status === QUESTION_STATUS.PENDING) {
    row.SubmittedAt = submittedAt ?? new Date().toISOString();
  } else if (status === QUESTION_STATUS.DRAFT) {
    row.SubmittedAt = null;
  }

  return row;
}

export function applyStatusFilterToQuery(query, filterInput) {
  const status = parseStatusFilterInput(filterInput);
  if (!status) return query;
  return query.eq('Status', status);
}

export function countQuestionsByStatus(questions) {
  const counts = { draft: 0, pending: 0, verified: 0, rejected: 0, total: 0 };
  for (const q of questions || []) {
    counts.total += 1;
    const slug = statusToApiSlug(resolveQuestionStatus(q));
    if (counts[slug] !== undefined) counts[slug] += 1;
  }
  return counts;
}

export function statusLabel(status) {
  const resolved = resolveQuestionStatus({ Status: status });
  const labels = {
    [QUESTION_STATUS.DRAFT]: 'Draft',
    [QUESTION_STATUS.PENDING]: 'Pending',
    [QUESTION_STATUS.VERIFIED]: 'Verified',
    [QUESTION_STATUS.REJECTED]: 'Rejected',
  };
  return labels[resolved] || 'Pending';
}
