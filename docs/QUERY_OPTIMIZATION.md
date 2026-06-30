# ProPath — Query & Data-Loading Optimization Strategy

This document describes the optimization pattern used for **Subject Expert → My Questions** (view/edit modals and exams dropdown). It has proven effective and is the reference approach for rolling similar improvements across Admin, Org, Reviewer, and Student portals.

**Reference implementation (March 2026):**

| Layer | File |
|-------|------|
| Backend | `backend/routes/shared/questions.js` |
| Frontend | `frontend/src/pages/expert/Questions.jsx` |

---

## Problem we solved

Users reported slow **View** (eye) and **Edit** actions on My Questions. Root causes:

1. **N+1 queries on the backend** — `/api/questions/exams/list` looped per exam → per subject → chapters + topics (dozens to hundreds of round trips).
2. **Redundant detail fetches** — Each view/edit click called `GET /api/questions/:id` even though the list already had most fields.
3. **Duplicate work on every edit** — The edit modal fetched the full exams tree again on every open.
4. **Perceived latency** — The UI waited for the network before showing anything (no instant modal).

---

## Strategy (four pillars)

### 1. Embed related data in list queries

Fetch child rows in **one Supabase select** instead of separate endpoints per row.

**Before:** List questions → click row → fetch options in a second query.

**After:** List questions with nested `Options` and `Topics` in a single query.

```js
// GET /api/questions
.select(`
  *,
  Topics(
    TopicID,
    TopicName,
    ChapterID,
    Chapters(ChapterID, ChapterNumber, ChapterName),
    Subjects(SubjectID, SubjectName, Exams(ExamID, ExamName))
  ),
  Options(OptionID, OptionText, IsCorrect, OptionNumber)
`)
```

Use a shared formatter so list and detail responses stay consistent:

```js
function formatQuestionRow(q) {
  const options = (q.Options || [])
    .slice()
    .sort((a, b) => (a.OptionNumber ?? 0) - (b.OptionNumber ?? 0));
  const { Options, ...rest } = q;
  return {
    ...rest,
    options,
    ExamName: q.Topics?.Subjects?.Exams?.ExamName,
    SubjectName: q.Topics?.Subjects?.SubjectName,
    TopicName: q.Topics?.TopicName,
    // ...
  };
}
```

**Rule:** If the UI needs data for view/edit, prefer including it in the **list** payload (when size is reasonable) rather than a follow-up request per click.

---

### 2. Replace N+1 loops with bulk queries + in-memory assembly

For hierarchical data (exam → subject → chapter → topic), **never** query inside nested `for` / `map` loops.

**Before (anti-pattern):**

```js
await Promise.all(exams.map(async (exam) => {
  const subjects = await supabase.from('Subjects').eq('ExamID', exam.ExamID);
  await Promise.all(subjects.map(async (subject) => {
    const chapters = await supabase.from('Chapters').eq('SubjectID', subject.SubjectID);
    const topics = await supabase.from('Topics').eq('SubjectID', subject.SubjectID);
  }));
}));
```

**After (pattern):**

1. Fetch parent rows (`Exams`).
2. Fetch all children in bulk with `.in('ParentID', ids)`.
3. Run independent child fetches in `Promise.all` where possible.
4. Build trees with `Map` lookups (O(n) assembly).

```js
async function buildExamsTree(exams) {
  const examIds = exams.map((e) => e.ExamID);
  const { data: subjects } = await supabase.from('Subjects').in('ExamID', examIds);

  const subjectIds = subjects.map((s) => s.SubjectID);
  const [{ data: chapters }, { data: topics }] = await Promise.all([
    supabase.from('Chapters').in('SubjectID', subjectIds),
    supabase.from('Topics').in('SubjectID', subjectIds),
  ]);

  // Group with Maps, then map exams → subjects → chapters/topics
}
```

**Query budget target for exams tree:** ~4 queries total (exams + subjects + chapters + topics), regardless of tree size.

---

### 3. Collapse detail endpoints into one round trip

**Before:** `GET /:id` fetched question, then options in a second query. Used `Topics!inner`, which also failed for draft questions without a topic.

**After:** Single select with left joins and embedded `Options`; reuse `formatQuestionRow`.

```js
// GET /api/questions/:questionId — still available as fallback
.select(`
  *,
  Topics(...),
  Options(OptionID, OptionText, IsCorrect, OptionNumber)
`)
```

Keep detail routes for deep links or refresh, but **do not require them** for normal list → modal flows.

---

### 4. Frontend: prefetch, cache at page level, open UI immediately

**Page mount** — load everything the modals need once, in parallel:

```js
useEffect(() => {
  loadQuestions();   // includes options
  loadExamsList(); // bulk-backed tree
}, []);
```

**View / Edit click** — use list data; open modal synchronously:

```js
const handleView = (question) => {
  setSelectedQuestion(question);
  setShowViewModal(true);
};

const handleEdit = (question) => {
  setSelectedQuestion(question);
  setShowEditModal(true);
};
```

**Edit modal** — receive prefetched data via props; do not refetch on every open:

```jsx
<EditQuestionModal
  question={selectedQuestion}
  examsList={examsList}
  examsListLoading={examsListLoading}
  ...
/>
```

**Rule:** Network on user action should be the exception (save, delete, submit), not open/view/edit.

---

## Avoid duplicate expensive work

| Issue | Fix |
|-------|-----|
| Subscription validated twice on exams list | Call `validateSubscriptionForQuestionCreation` once; reuse result |
| Exams list fetched per modal open | Prefetch on parent page; pass as props |
| Same formatter in list + detail | Single `formatXRow()` helper |
| Inner joins hiding null relations | Prefer optional embeds (`Topics(...)`) over `Topics!inner` when drafts/null FKs exist |

---

## When to apply this pattern

Use this strategy when you see:

- Nested `map` + `await supabase` in route handlers
- “Click row → loading spinner → second API call” UX
- Modals or drawers that refetch reference data (exams, orgs, plans) on every open
- List pages where view/edit need child tables (options, assignments, attempts)

**Good candidates elsewhere in ProPath:**

- Admin / Org question banks (list + view/edit)
- Reviewer queue (question details + options)
- Org test wizard (exams/subjects/topics tree)
- Student test history (attempt + answers)
- Dashboard widgets that aggregate then drill down

---

## Rollout checklist (per feature)

Copy this checklist when implementing on a new module:

### Backend

- [ ] Identify N+1 loops in the route; count queries per request (aim for fixed small number).
- [ ] Add bulk `.in()` fetches for child tables.
- [ ] Use `Promise.all` for sibling tables at the same depth.
- [ ] Assemble hierarchy in memory with `Map` grouping.
- [ ] Embed frequently needed children in list `select` (only columns the UI uses).
- [ ] Extract `formatXRow()` shared by list and detail handlers.
- [ ] Use left/optional joins where FK can be null.
- [ ] Remove duplicate validation or config fetches in the same handler.

### Frontend

- [ ] Include child data in list state (e.g. `options` on each question).
- [ ] Prefetch shared reference data on page mount (exams tree, filters metadata).
- [ ] Open modals immediately from list row data.
- [ ] Pass cached reference data into modals via props.
- [ ] Reserve API calls on click for mutations (save, delete, submit).
- [ ] Keep detail endpoint only for direct URL / hard refresh / stale row edge cases.

### Verification

- [ ] Network tab: view/edit opens with **0 new requests** (after initial page load).
- [ ] Network tab: exams/list is **one request**, not hundreds.
- [ ] Backend logs or query count: tree endpoints use **O(1)** query count relative to tree size.
- [ ] Draft / null-FK rows still load correctly.

---

## Performance expectations

| Action | Before | After |
|--------|--------|-------|
| Open View modal | 1× `GET /questions/:id` | 0 extra requests |
| Open Edit modal | 1× detail + 1× exams/list (N+1) | 0 extra requests if prefetch done |
| Initial My Questions page | 1× list | 1× list (with options) + 1× exams/list (~4 DB queries) |
| Exams list API (backend) | O(exams × subjects) queries | ~4 queries |

---

## Naming & file conventions

- **Doc:** `docs/QUERY_OPTIMIZATION.md` (this file)
- **Helpers:** Co-locate `formatXRow` / `buildXTree` in the route file until reused; move to `backend/utils/` when a second route needs the same tree.
- **Frontend cache:** Page-level state first; promote to React context or a small API cache module only if multiple routes share the same reference data.

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system overview and request flow
- [API_OVERVIEW.md](./API_OVERVIEW.md) — HTTP surface area
- [IMPROVEMENTS_TRACKER.md](./IMPROVEMENTS_TRACKER.md) — track rollout to other portals

---

## Summary

> **Load once, embed children, bulk-fetch trees, assemble in memory, open UI from cache.**

This is the ProPath standard for list + modal flows. When asked to optimize another area, apply the four pillars and the rollout checklist above before introducing new caching layers or infrastructure.
