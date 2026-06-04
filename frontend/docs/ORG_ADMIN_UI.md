# Org Admin UI Guide

Reference for building and extending the **Organization Admin** portal in ProPath. Patterns are taken from the live Org Admin screens—especially **Dashboard**, and the refined **Settings**, **Explore Exams**, **Subscription Plans**, **Users**, **Exam Enrollments**, and **Students** flows.

Use this document when adding a new org page or refactoring an older screen so it matches the portal.

---

## 1. Design principles

| Principle | What it means in practice |
|-----------|---------------------------|
| **One brand color** | Org Admin accent is **primary blue** (`#1e3a8a` → `#1d4ed8`). Avoid random per-row avatar colors; use the primary gradient for initials. |
| **Two page shells** | **Premium dashboard** (hero, charts, stat cards) vs **standard feature pages** (header + stats + toolbar + table/cards). |
| **Shared layout CSS first** | Import `OrgStudentExamEnrollments.css` + `Students.css` before page-specific CSS. |
| **Lucide icons** | `lucide-react` at 16–28px; title icons use `org-ex-enroll-title-icon`. |
| **Inter + CSS variables** | Global tokens in `src/index.css`; portal density in `src/styles/portal-tokens.css`. |
| **No teal as org primary** | Teal (`#14b8a6`) is a subtle background accent on the dashboard only—not the main CTA color. |

---

## 2. Global tokens

Defined in `frontend/src/index.css`:

```css
--primary: #1e3a8a;
--primary-hover: #1d4ed8;
--secondary: #38bdf8;
--accent: #14b8a6;
--background: #f8fafc;
--surface: #ffffff;
--text: #0f172a;
--text-muted: #475569;
--border: #e2e8f0;
```

Portal shell (sidebar density, shadows) — `frontend/src/styles/portal-tokens.css`:

- Root class: **`.app-portal`** on the layout wrapper.
- Premium dashboard aliases: `--od-radius`, `--od-shadow`, `--od-accent`, `--od-border`.

---

## 3. Two page archetypes

### A. Premium dashboard (`portal-dashboard`)

**Used by:** `Dashboard.jsx`  
**CSS:** `Dashboard.css` (shared with reviewer/expert dashboards via `.portal-dashboard`)

```jsx
<div className="dashboard-page portal-dashboard">
  <div className="org-dash-hero">…</div>
  {error && <div className="notice error notice--spaced">…</div>}
  <nav className="org-quick-nav">…</nav>
  <div className="stats-grid">…</div>
  {/* charts, activity feed */}
</div>
```

**Hero block**

- Kicker: `org-dash-kicker` (uppercase pill, e.g. “Overview”).
- Title: `<h1>Dashboard</h1>`.
- Subtitle: `page-subtitle`.
- Meta row: `org-dash-meta` (org name, last updated).
- Actions: `action-btn-ghost` (refresh), `action-btn-header` (primary CTA).

**Background**

- Fixed radial gradients via `.dashboard-page.portal-dashboard::before`.

**Stat cards**

- Grid: `stats-grid` → `stat-card` (+ `clickable` if navigates).
- Icon box: `stat-icon` with Lucide icon.
- Values: `stat-value`, `stat-label`, optional `stat-trend`.

**Quick nav**

- `org-quick-nav` → `org-quick-nav__btn` (pill buttons to main routes).

**Charts (Recharts)**

- Shared tick/grid/tooltip constants at top of `Dashboard.jsx`.
- Palette: `COLORS` array aligned with brand blues/teals—not neon rainbow per chart.

**Loading**

- `OrgDashboardSkeleton` + `org-dash-hero--loading`.

---

### B. Standard feature page (`org-ex-enroll-page`)

**Used by:** Settings, Explore Exams, Subscription Plans, Users, Exam Enrollments, Students (partially)

**Base CSS:** `OrgStudentExamEnrollments.css`  
**Buttons / tables / modals:** `Students.css`

```jsx
<div className="org-ex-enroll-page org-{feature}-page">
  <div className="page-header org-ex-enroll-header org-{feature}-header">
    <div>
      <h1>
        <Icon size={28} className="org-ex-enroll-title-icon" aria-hidden />
        Page title
      </h1>
      <p className="page-subtitle">Short description for org admins.</p>
    </div>
    <div className="org-{feature}-header-actions">
      <button type="button" className="btn-primary">…</button>
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

  {/* stats row, filters, content */}
</div>
```

**Page-specific CSS:** `{Feature}.css` with prefix `org-{feature}-*` (e.g. `org-users-stats`, `org-explore-card`).

---

## 4. Stylesheet map

| File | Role |
|------|------|
| `index.css` | Global colors, font, base `button { font-family }` |
| `styles/portal-tokens.css` | `.app-portal` density and `--od-*` tokens |
| `pages/org/Dashboard.css` | `.portal-dashboard`, hero, stats, charts, notices (error), subscription banner |
| `pages/org/OrgStudentExamEnrollments.css` | **Shared org shell**: page width, header, tabs, panels, search, notices (warn), checklists |
| `pages/org/Students.css` | **Shared controls**: `btn-primary`, `btn-secondary`, `page-header`, `students-table`, `btn-icon-small`, `notice.success/error`, modals |
| `pages/org/Settings.css` | Settings tabs, forms, subscription tab |
| `pages/org/ExploreExams.css` | Catalog cards, filters, stats |
| `pages/org/SubscriptionPlans.css` | Plan cards, filters, modals |
| `pages/org/Users.css` | Users stats, role pills, table, modals |
| `pages/org/QuestionBank.css` | Question bank filters/stats (when embedded in enrollments) |

**Import order (recommended)**

```js
import '../org/OrgStudentExamEnrollments.css';
import './Students.css';           // if you need buttons, tables, notices
import './YourPage.css';           // last — overrides only
```

---

## 5. Common UI blocks

### 5.1 Page header

From `Students.css`:

- `.page-header` — flex, space-between, wrap.
- `.page-subtitle` — muted description under `h1`.
- Title row: flex + `org-ex-enroll-title-icon` (primary-colored icon).

### 5.2 Stats row

Pattern used on Users, Explore Exams, Subscription Plans:

```html
<div class="org-{feature}-stats">
  <div class="org-{feature}-stat">
    <span class="org-{feature}-stat-value">12</span>
    <span class="org-{feature}-stat-label">Label</span>
  </div>
  <!-- optional modifiers: --primary, --ok, --muted, --warn -->
</div>
```

- Grid: 4–5 columns desktop, 2 columns under ~800–900px.
- Card: 12px radius, 1px `var(--border)`, white surface.

### 5.3 Search + pill filters

**Search (enrollment style)**

```html
<div class="org-ex-enroll-search org-ex-enroll-search--wide">
  <Search size={18} />
  <input type="search" placeholder="…" />
</div>
```

**Search (students style)** — `search-box` in `Students.css`.

**Pill filters** — e.g. Users `org-users-filter`, Plans `org-plans-filter`:

- Inactive: border + muted text.
- `.active`: primary border + light primary background.

### 5.4 Tabs

```html
<div class="org-ex-enroll-tabs" role="tablist">
  <button type="button" class="org-ex-enroll-tab active">…</button>
</div>
```

Active tab: primary text + **top** border (not bottom).

### 5.5 Panels & empty states

```html
<div class="org-ex-enroll-panel org-{feature}-empty">
  <Icon size={40} />
  <h3>No items</h3>
  <p class="org-ex-enroll-panel-hint">Help text.</p>
  <button type="button" class="btn-primary">CTA</button>
</div>
```

### 5.6 Notices & banners

| Class | Use |
|-------|-----|
| `org-ex-enroll-notice` + `notice warn` | Warnings, API errors (amber) — `OrgStudentExamEnrollments.css` |
| `notice success` | Save/create success — `Students.css` (+ page override e.g. `org-users-success-notice`) |
| `notice error` | Dashboard errors — `Dashboard.css` |
| `subscription-banner` | Dashboard subscription status (success/warning variants) |

Always wrap with `role="alert"` or `role="status"` and include a Lucide icon.

### 5.7 Data tables

Use the **Students table** primitives:

```html
<div class="students-table-container">
  <table class="students-table org-users-table">
    <thead>…</thead>
    <tbody>…</tbody>
  </table>
</div>
```

**Row actions** — must use `btn-icon-small` (not raw buttons with global padding):

```html
<div class="table-actions">
  <button type="button" class="btn-icon-small" title="Edit" aria-label="Edit">
    <Edit size={16} aria-hidden />
  </button>
  <button type="button" class="btn-icon-small btn-danger" …>
    <Trash2 size={16} aria-hidden />
  </button>
</div>
```

> **Pitfall:** `App.css` sets large padding on all `button` elements. Icon-only actions **require** `btn-icon-small` or `btn-icon` from `Students.css`.

### 5.8 Avatars (initials)

**One style for all org users/students:**

```css
background: linear-gradient(135deg, var(--primary), var(--primary-hover));
color: #fff;
width: 36px;
height: 36px;
border-radius: 50%;
```

Reference: `.student-avatar` in `Students.css`, `.org-users-avatar` in `Users.css`.

Role distinction → **role pills**, not avatar color.

### 5.9 Modals

**Portal overlay pattern** (Users, Subscription Plans):

- `createPortal(…, document.body)`
- Overlay: `org-users-modal-overlay` (fixed, dimmed backdrop)
- Dialog: `org-users-modal` / `org-plans-modal-*`
- Close: `btn-icon` + `<X />`
- Footer: `btn-secondary` cancel + `btn-primary` submit

Click overlay to close; `stopPropagation` on dialog.

### 5.10 Loading states

```jsx
<div className="org-{feature}-loading">
  <Loader2 size={22} className="spin-icon" aria-hidden />
  Loading…
</div>
```

Define `@keyframes` for `.spin-icon` in page CSS or reuse `org-plans-spin` from `SubscriptionPlans.css`.

---

## 6. Buttons

| Class | When to use |
|-------|-------------|
| `btn-primary` | Main action (Add user, Save, Subscribe). Gradient primary, white text. |
| `btn-secondary` | Secondary / link-styled actions, header links. |
| `btn-danger` | Destructive confirm in modals. |
| `btn-icon` | Modal close (minimal padding). |
| `btn-icon-small` | Table row edit/delete. |
| `action-btn-header` | Dashboard hero primary CTA only. |
| `action-btn-ghost` | Dashboard refresh/secondary hero actions. |

Primary buttons often pair with Lucide icons at 16–18px and `gap: 8px`.

---

## 7. Icons

- Library: **`lucide-react`**
- Title: **28px**, class `org-ex-enroll-title-icon`
- Inline / buttons: **16–18px**
- Stat cards / quick nav: **18px**, `strokeWidth={2}` where needed

Semantic icons (examples from Dashboard):

| Area | Icons |
|------|--------|
| Users | `Users`, `UserPlus` |
| Exams | `BookOpen`, `Compass`, `Search` |
| Plans | `Package` |
| Tests | `FileText`, `Plus` |
| Settings | `Settings`, `Shield`, `Save` |
| Status | `AlertCircle`, `CheckCircle2`, `Loader2` |

---

## 8. Org Admin routes (quick reference)

From Dashboard quick nav and refined pages:

| Path | Page | Shell |
|------|------|--------|
| `/org/dashboard` | Dashboard | `portal-dashboard` |
| `/org/explore-exams` | Explore Exams | `org-ex-enroll-page` |
| `/org/subscription-plans` | Subscription Plans | `org-ex-enroll-page` |
| `/org/settings` | Settings (tabs) | `org-ex-enroll-page` |
| `/org/users` | Users | `org-ex-enroll-page` |
| `/org/students` | Students | `students-page` + Students.css |
| `/org/student-exam-enrollments` | Exam Enrollments | `org-ex-enroll-page` |
| `/org/tests` | Tests | (legacy; align when touched) |
| `/org/question-bank` | Question Bank | QuestionBank.css |
| `/org/logs` | Logs | |

---

## 9. API modules (frontend)

From `frontend/src/services/api.js`:

| Export | Purpose |
|--------|---------|
| `orgAuth` | Login, `getCurrentUser()` (org name, user id) |
| `orgDashboard` | Stats, explore exams, subscriptions, logs, questions |
| `userManagement` | Org users CRUD (`/api/org/users`) |
| `studentAPI` | Students, bulk register, exam enrollments |
| `orgSettingsAPI` | Enrollment + account + usage settings |

Use `orgAuth.getCurrentUser()` for greetings (“Welcome back, {firstName}”) and self-vs-other rules (e.g. cannot delete own org user).

---

## 10. Reference implementations

| Feature | JSX | CSS | Notes |
|---------|-----|-----|--------|
| Dashboard | `Dashboard.jsx` | `Dashboard.css` | Hero, charts, quick nav, subscription banner |
| Explore Exams | `ExploreExams.jsx` | `ExploreExams.css` | Stats, tabs, catalog cards, plan banner |
| Subscription Plans | `SubscriptionPlans.jsx` | `SubscriptionPlans.css` | Stats, filter tabs, card grid, modals |
| Settings | `Settings.jsx` | `Settings.css` | Tabs, panels, enrollment radios |
| Users | `Users.jsx` | `Users.css` | Stats, filters, table, edit/delete modals |
| Exam Enrollments | `OrgStudentExamEnrollments.jsx` | `OrgStudentExamEnrollments.css` | Tabs, roster tables, requests |
| Students | `Students.jsx` | `Students.css` | Tables, bulk upload, `btn-icon-small` |

---

## 11. Checklist for a new Org Admin page

1. [ ] Choose shell: `portal-dashboard` **or** `org-ex-enroll-page`.
2. [ ] Import `OrgStudentExamEnrollments.css` + `Students.css` (if buttons/tables/notices needed).
3. [ ] Add `org-{name}-page` wrapper and `page-header` with title icon + `page-subtitle`.
4. [ ] Add stats row if the page shows counts.
5. [ ] Use `org-ex-enroll-notice` + `notice warn/success` for feedback.
6. [ ] Use `btn-primary` / `btn-secondary`; table actions use `btn-icon-small`.
7. [ ] Avatars: primary gradient only.
8. [ ] Loading: `Loader2` + `spin-icon`.
9. [ ] Modals: portal to `document.body`, overlay click to close.
10. [ ] Page-specific styles only in `org-{name}-*.css` — avoid duplicating tokens.
11. [ ] Wire route in app router + add quick nav entry on Dashboard if it’s a top-level feature.

---

## 12. Minimal page template (copy-paste)

```jsx
import { useEffect, useState } from 'react';
import { Plus, AlertCircle, Loader2, YourIcon } from 'lucide-react';
import { orgDashboard } from '../../services/api';
import '../org/OrgStudentExamEnrollments.css';
import './Students.css';
import './YourFeature.css';

export default function YourFeature() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');
        // await orgDashboard…
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="org-ex-enroll-page org-your-feature-page">
        <div className="org-your-feature-loading">
          <Loader2 size={22} className="spin-icon" aria-hidden />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="org-ex-enroll-page org-your-feature-page">
      <div className="page-header org-ex-enroll-header org-your-feature-header">
        <div>
          <h1>
            <YourIcon size={28} className="org-ex-enroll-title-icon" aria-hidden />
            Your feature
          </h1>
          <p className="page-subtitle">What org admins do on this page.</p>
        </div>
        <button type="button" className="btn-primary">
          <Plus size={18} />
          Primary action
        </button>
      </div>

      {error && (
        <div className="org-ex-enroll-notice" role="alert">
          <div className="notice warn">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="org-your-feature-stats">{/* stat cards */}</div>
      <div className="org-ex-enroll-panel">{/* main content */}</div>
    </div>
  );
}
```

---

## 13. Related docs

- Frontend setup: `frontend/README.md`
- API env: `REACT_APP_API_URL` in `.env.local`
- Backend org routes: `backend/routes/` (`orgSettings.js`, `users.js`, `students.js`, etc.)

---

*Last aligned with Org Admin UI: Dashboard, Settings, Explore Exams, Subscription Plans, Users, Exam Enrollments, Students.*
