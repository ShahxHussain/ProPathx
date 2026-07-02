# Bulk Question Upload — Feasibility & Implementation Plan

**Status:** Planning only (not implemented)  
**Last updated:** 2026-06-24  
**Related:** `frontend/src/pages/expert/Create.jsx`, `backend/routes/shared/questions.js`, `backend/routes/org/students.js` (CSV bulk pattern), `backend/utils/questionDuplicate.js`

---

## 1. Requirement summary

The product should support **bulk entry of MCQ questions** via downloadable templates and upload, in these formats:

| Format | Purpose |
|--------|---------|
| **CSV** | Structured tabular upload |
| **DOC/DOCX** | Word template for authors |
| **LaTeX** | Math-heavy authoring |
| **PDF** | Legacy / scanned material |

Authors also need **predefined templates** so questions match system rules before upload.

**Important constraint (from product):** Many fields are **dropdowns** in the UI (exam, subject, chapter, topic, difficulty, question type, source), and **correct options** are **selected checkboxes/radio** — not free text. Bulk upload must reconcile this.

---

## 2. Current ProPath question model (what bulk must produce)

Each MCQ in the database maps to:

| Layer | Fields | Notes |
|-------|--------|-------|
| **Context** | Exam → Subject → Chapter (optional) → Topic (optional) | Hierarchical FKs; org experts scoped by subscription |
| **Question** | `QuestionText`, `DifficultyLevel`, `QuestionType`, `Source`, `Explanation` | Enums: Easy/Medium/Hard; Single/Multiple Correct; Self/AI/Reference/Previous |
| **Options** | 2–6 rows: `OptionText`, `IsCorrect` | Single Correct → exactly one `true`; Multiple Correct → ≥2 `true` |
| **Workflow** | `Status`: Draft \| Pending \| Verified \| Rejected | Bulk submit usually → Pending; drafts optional |
| **Quality** | Duplicate check (text + context) | 409 on duplicate non-draft submit |
| **Rich text** | LaTeX/KaTeX in question, options, explanation | Stored as plain text with `$...$` / `$$...$$` delimiters |

**Existing bulk features (not the same thing):**

- **Org student CSV bulk** (`POST /api/org/students/bulk`) — row validation, per-row errors, caps (200 rows). Good pattern to reuse.
- **Test bulk add** (`POST /api/org/tests/:testId/questions/bulk`) — pulls **existing** verified questions into a test; does **not** create new questions.

There is **no bulk question creation** API today.

---

## 3. Recommended product pattern for dropdowns & correct answers

Bulk files should **not** try to replicate every UI dropdown inside Word/PDF. Use a **two-step wizard**:

```
Step 1 — Context (UI dropdowns, same as Create MCQ)
  Exam, Subject, Chapter, Topic, default Difficulty / Type / Source

Step 2 — Upload file
  File contains question bodies + options + correct markers only
  Server attaches Step 1 context to every parsed row
```

| Approach | Dropdowns | Correct answers | Verdict |
|----------|-----------|-----------------|---------|
| **A. Context in UI + file = content only** | Selected once in app | Encoded in file (see §4) | **Recommended** |
| **B. Full hierarchy in every row (CSV)** | Column per level or codes | Per-row in file | Possible but error-prone |
| **C. Interactive dropdowns inside Word/PDF** | Content controls / forms | Form checkboxes | Fragile across editors & exports |

**Why A wins:** Matches how authors think (“this file is 50 questions for Biology Ch.3”), avoids 4-level hierarchy typos in 200 rows, and keeps validation identical to single Create flow.

**Correct-answer encoding (works for CSV, DOCX tables, LaTeX macros):**

- **Single Correct:** `correct=B` or `correct_option=2` or column `IsCorrect` = `Y` on one option row.
- **Multiple Correct:** `correct=B,D` or multiple `Y` in option rows.
- Reject row if Single Correct has ≠1 correct, or Multiple Correct has &lt;2.

---

## 4. Format-by-format feasibility

### 4.1 CSV

| | |
|--|--|
| **Feasibility** | **High** — best first delivery |
| **Pros** | Easy parse (Node `csv-parse` / Papaparse); row-level errors; matches student bulk UX; template download trivial; works with Step 1 context wizard |
| **Cons** | LaTeX commas/newlines need quoting; authors must escape `"`; no WYSIWYG |
| **Dropdowns** | Set in UI (recommended) OR columns `exam_code`, `subject_name`, `topic_id` with server lookup |
| **Correct answers** | Columns: `option_a`…`option_f`, `correct` (`B` or `B,D`) OR `correct_a`…`correct_f` (`Y`/`N`) |
| **Template** | Ship `propath-questions-template.csv` + `propath-questions-reference.csv` (valid enum values & topic IDs for selected exam) |

**Example row (context from UI):**

```csv
question_text,difficulty,question_type,option_a,option_b,option_c,option_d,correct,explanation
"What is 2+2?",Easy,Single Correct,3,4,5,6,B,"Basic addition"
```

**LaTeX in CSV:** Store as `"$\frac{1}{2}$"` in quoted cells — already compatible with `LaTeXRenderer`.

---

### 4.2 DOC / DOCX template

| | |
|--|--|
| **Feasibility** | **Medium** with a **strict** template; **Low** with free-form Word |
| **Pros** | Familiar to teachers; tables per question; instructions + examples in same file |
| **Cons** | Users edit layout → parser breaks; Word ≠ PDF; embedded OLE/math objects; version differences (.doc vs .docx) |
| **Dropdowns** | Do **not** rely on Word dropdown content controls for exam/topic — use Step 1 UI. Optional: fixed header fields filled by author (validated server-side) |
| **Correct answers** | **Table per question:** columns `Option`, `Text`, `Correct?` (`Yes`/`No`). Parser reads tables via `mammoth` + custom post-process or `docx` XML traversal |

**What works**

- One `.docx` master template: title block + repeating “Question block” table.
- Download from app; user fills tables; upload `.docx` only (convert `.doc` → `.docx` on upload or reject `.doc`).

**What does not work reliably**

- Checkbox form fields surviving round-trip.
- Free-form paragraphs without table structure.
- Auto-detect question boundaries in arbitrary documents.

**Drawbacks**

- New dependency (`mammoth`, `jszip`, or server-side LibreOffice for conversion).
- Higher support burden (“my file looks fine in Word but fails parse”).

---

### 4.3 LaTeX template

| | |
|--|--|
| **Feasibility** | **Medium** for a **custom ProPath `.tex` schema**; **Low** for arbitrary LaTeX |
| **Pros** | Best for STEM; authors already use LaTeX; quality math |
| **Cons** | No universal MCQ LaTeX standard; full TeX engine on server is heavy; macro abuse / `\input` security risk |
| **Dropdowns** | Metadata block at top of file **or** UI Step 1 only |

**Practical approach**

Define a **restricted** template, e.g.:

```latex
% propath-questions.tex
\begin{propathquestion}{difficulty=Medium}{type=Single Correct}
  Question text with $x^2$ ...
  \begin{options}
    \option[correct]{First wrong}
    \option{Correct answer}
  \end{options}
  \begin{explanation} ... \end{explanation}
\end{propathquestion}
```

Parse with regex / light tokenizer (not full TeX), **or** compile + extract (complex).

**Safer alternative:** LaTeX **inside CSV cells** (§4.1) rather than standalone `.tex` bulk — 80% of value, 20% of risk.

**Drawbacks**

- Server must not run arbitrary `\write18` / shell escape.
- Authors must learn ProPath-specific macros.

---

### 4.4 PDF template

| | |
|--|--|
| **Feasibility** | **Low** for automated import; **Very low** for checkbox/dropdown fidelity |
| **Pros** | Users have legacy PDF banks |
| **Cons** | OCR errors; multi-column layout; math as images; “selected” circles not machine-readable; legal/scanned docs |
| **Dropdowns** | Cannot encode — PDF is presentation, not data |
| **Correct answers** | Heuristic (filled bubble detection) needs CV pipeline; not production-ready for MVP |

**Realistic options**

| Option | Description |
|--------|-------------|
| **Reject PDF for MVP** | Honest scope; offer CSV/DOCX instead |
| **PDF → manual queue** | Upload PDF, create “import job”, staff transcribe (future) |
| **PDF + OCR assist** | Suggest draft rows for human review in UI — high cost, error-prone |

**Verdict:** Do **not** promise PDF bulk parse in v1. If required later, treat as **AI-assisted draft** with mandatory human review per question.

---

## 5. Pros and cons (overall feature)

### Pros

- **Throughput** — Subject Experts import dozens/hundreds of questions vs one-by-one Create MCQ.
- **Migration** — Schools move existing banks into ProPath faster.
- **Consistency** — Template enforces option count, correct-answer rules, required fields.
- **Reuse** — Same validation, duplicate check, status workflow as `POST /api/questions`.
- **Familiar pattern** — Student CSV bulk already proves org appetite and error-report UX.

### Cons / risks

- **Support load** — “File works in Excel/Word but fails in ProPath.”
- **Partial failure** — 180/200 rows valid: need transaction strategy (all-or-nothing vs per-row).
- **Reviewer flood** — Bulk submit → Pending spikes queue.
- **Duplicate storms** — 50 near-duplicate rows → many 409s; need preview step.
- **Security** — File upload size, malware scan, ZIP bombs in DOCX.
- **LaTeX/XSS** — Sanitize stored text; same rules as single create.
- **Subscription limits** — Org experts: cap questions per plan; bulk must check quotas before insert.
- **False expectation on PDF** — Users expect magic OCR; set expectations early.

---

## 6. What can be done vs what should not (MVP)

### Can do (recommended phases)

| Phase | Scope | Effort (rough) |
|-------|--------|----------------|
| **Phase 1** | CSV + UI context wizard + downloadable template + preview grid + per-row errors | 2–3 weeks |
| **Phase 2** | DOCX strict table template + parser | +2 weeks |
| **Phase 3** | ProPath LaTeX subset template OR “LaTeX in CSV” docs only | +1–2 weeks |
| **Phase 4** | Bulk draft import (save as Draft, review in UI before submit) | +1 week |
| **Phase 5** | Async jobs for &gt;100 rows (queue + email/notification) | +2 weeks |

**Functional requirements achievable in MVP (Phase 1):**

- Subject Expert + Org Subject Expert (with subscription check).
- Max rows per upload (e.g. 100–200, align with student bulk).
- Preview before commit: show parsed questions, highlight errors, duplicate warnings.
- Import as **Draft** or **Pending** (user choice).
- Row error report: `{ row, field, code, message }` downloadable as CSV.
- Reuse `buildQuestionPayload`, `findDuplicateQuestion`, `buildStatusFields`.

### Should not do (or defer)

| Item | Reason |
|------|--------|
| **PDF auto-import** | Unreliable; expensive; wrong checkbox detection |
| **Free-form DOCX/PDF** | Unbounded parse failures |
| **Real dropdown widgets in template files** | Not portable; use UI + codes |
| **Auto-submit all as Verified** | Breaks reviewer workflow |
| **Skip duplicate detection** | Data quality regression |
| **Full TeX live compilation on server** | Security + ops burden |
| **Bulk edit of verified questions** | Out of scope; verified is locked |

### Cannot do (platform limits)

- **Perfect recovery of author intent from any PDF/scan** without human review.
- **Guarantee** that Word “checkbox” UI exports as machine-readable selection (depends on client).
- **Embed live exam/topic dropdowns** inside static CSV/PDF that stay in sync with DB without a **reference export** from the app.

---

## 7. Proposed architecture (when implemented)

```
┌─────────────┐     Step 1: context      ┌──────────────────┐
│ Expert UI   │ ───────────────────────►│ exam/subject/    │
│ Bulk Upload │                         │ topic (dropdowns)│
└──────┬──────┘                         └──────────────────┘
       │ Step 2: file
       ▼
┌─────────────┐     parse + validate     ┌──────────────────┐
│ Upload CSV  │ ───────────────────────►│ Parser layer     │
│ DOCX / TeX  │                         │ (per format)     │
└─────────────┘                         └────────┬─────────┘
                                                 │
                    preview ◄────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Normalized rows[]    │
              │ → questionAPI shape  │
              └──────────┬───────────┘
                         │ POST bulk (transactional batches)
                         ▼
              ┌──────────────────────┐
              │ Questions + Options  │
              │ Status: Draft/Pending│
              └──────────────────────┘
```

**Suggested API (future):**

- `GET /api/questions/bulk/template?format=csv&examId=...` — download template + reference sheet.
- `POST /api/questions/bulk/parse` — multipart file + context JSON → `{ rows, errors, warnings }` (no DB write).
- `POST /api/questions/bulk/commit` — `{ rows[], status: 'Draft'|'Pending' }` → `{ created, skipped, errors[] }`.

---

## 8. Validation rules (must match Create MCQ)

| Rule | Bulk handling |
|------|----------------|
| Question text ≥ 10 chars (non-draft) | Per-row error |
| ≥ 2 non-empty options | Per-row error |
| No duplicate option text (case-insensitive) | Per-row error |
| Single Correct → exactly 1 correct | Per-row error |
| Multiple Correct → ≥ 2 correct | Per-row error |
| Topic required if mode = existing | From Step 1 context |
| Duplicate question (text + context) | Warning on preview; block on commit if Pending |
| Org subscription / exam access | Reject entire job before parse if context invalid |
| Max options 6 | Per-row error |

---

## 9. Template deliverables (predefined)

| Asset | Format | Contents |
|-------|--------|----------|
| **Questions template** | CSV | Header row + 2 example rows |
| **Reference sheet** | CSV (generated) | Topics, enums, IDs for selected exam |
| **Authoring guide** | PDF/Markdown | How to mark correct answers, LaTeX tips |
| **Word template** | DOCX | Fixed tables, instructions, no content controls required |
| **LaTeX template** | `.tex` | ProPath macros + 2 examples |
| **PDF** | — | **Authoring guide only**, not upload target for v1 |

---

## 10. UX notes (dropdowns & checkboxes)

1. **Never ask authors to pick topic per row in Word** — use Step 1 or a single `topic_id` column validated against reference export.
2. **Preview grid** should render LaTeX and show **which options are correct** (icons), mirroring Create MCQ.
3. **Fix-in-place** — allow editing failed rows in UI before commit (reduces re-upload cycles).
4. **Checkbox metaphor in file** — use `Y/N`, `1/0`, `*`, or `correct=B`; document one canonical scheme in template.
5. **Platform vs org expert** — same wizard; org path enforces subscription exams only (existing `getExamsList` logic).

---

## 11. Decision matrix (format priority)

| Format | Implement? | Priority | Primary use case |
|--------|--------------|----------|------------------|
| CSV | Yes | **P0** | Default bulk path |
| DOCX (strict template) | Yes | **P1** | Non-technical authors |
| LaTeX (ProPath schema) | Maybe | **P2** | Power users / STEM |
| LaTeX in CSV cells | Yes | **P0** (document) | Math without new parser |
| PDF upload parse | No (v1) | **Defer** | Legacy; manual/AI later |

---

## 12. Open questions for stakeholders

1. Bulk import default status: **Draft** (safer) or **Pending** (faster to review queue)?
2. Max rows per upload: **100**, **200**, or plan-based?
3. On partial errors: **commit valid rows only** or **all-or-nothing**?
4. Allow **new topic creation** in bulk or require existing topic from Step 1?
5. Is **PDF** a hard requirement for v1, or can authoring guide + CSV/DOCX suffice?
6. Should **OrgAdmin** bulk-import on behalf of experts, or experts only?

---

## 13. Summary

| Question | Answer |
|----------|--------|
| **Is bulk question upload possible?** | **Yes**, with CSV + UI context wizard as the reliable foundation. |
| **Best format to start?** | **CSV** (+ downloadable template). |
| **How to handle UI dropdowns?** | **Select context once in the app**; file holds question content + correct markers. |
| **How to handle correct answers?** | Encode as column(s) or table `Correct?` — not literal checkboxes in PDF. |
| **DOCX / LaTeX?** | Feasible with **strict templates**; higher maintenance. |
| **PDF?** | **Not feasible** for reliable automated import in v1; defer or human-in-the-loop. |
| **Main drawback?** | Authoring-format chaos unless templates and preview are strict. |

**Recommendation:** Approve **Phase 1 (CSV + wizard + preview)** before investing in DOCX/LaTeX/PDF parsers. Reuse patterns from `org/students` bulk and validation from `shared/questions.js`.

---

## Related docs

- [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) — bulk commit should use batch inserts, not N+1.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — React → Express → Supabase; no direct DB from browser.
- `Reference_Documents/Database_Schema.md` — `Questions`, `Options`, status enum.
