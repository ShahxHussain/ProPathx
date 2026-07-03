# ProPath — Complete User Roles & Features Reference

**Purpose:** Exhaustive catalog of what every user type can see and do in ProPath, from login through each portal screen.  
**Scope:** Platform-level (`Users` table) and organization-level (`OrgUsers` / `Students` tables).  
**Last updated:** 2026-05-21  
**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [API_OVERVIEW.md](./API_OVERVIEW.md) · [README.md](../README.md)

---

## Table of contents

1. [User model overview](#1-user-model-overview)
2. [Authentication & public access](#2-authentication--public-access)
3. [Shared UI (all authenticated roles)](#3-shared-ui-all-authenticated-roles)
4. [SuperAdmin (platform)](#4-superadmin-platform)
5. [OrgAdmin (organization)](#5-orgadmin-organization)
6. [Subject Expert](#6-subject-expert)
7. [Reviewer](#7-reviewer)
8. [Student — organization-linked](#8-student--organization-linked)
9. [Student — individual (self-service)](#9-student--individual-self-service)
10. [Cross-cutting domain concepts](#10-cross-cutting-domain-concepts)
11. [Platform vs organization — quick matrix](#11-platform-vs-organization--quick-matrix)
12. [Known gaps & notes](#12-known-gaps--notes)

---



## 1. User model overview

ProPath uses a **two-tier identity model**:


| Tier             | Storage    | Roles                                                    | Scope                                                     |
| ---------------- | ---------- | -------------------------------------------------------- | --------------------------------------------------------- |
| **Platform**     | `Users`    | SuperAdmin, Reviewer, Subject Expert, Admin, Support, AI | Global — not tied to one organization                     |
| **Organization** | `OrgUsers` | OrgAdmin, Reviewer, Subject Expert                       | Single `OrgID` — tenant-isolated                          |
| **Learner**      | `Students` | Student                                                  | Org-linked (`OrgID` set) **or** individual (`OrgID` null) |




### Role → portal mapping


| Role           | Login path         | Default portal     | UI prefix     |
| -------------- | ------------------ | ------------------ | ------------- |
| SuperAdmin     | `/admin/login`     | Admin dashboard    | `/admin/*`    |
| OrgAdmin       | `/login` (org)     | Org dashboard      | `/org/*`      |
| Subject Expert | `/login` (org)     | Expert dashboard   | `/expert/*`   |
| Reviewer       | `/login` (org)     | Reviewer dashboard | `/reviewer/*` |
| Student        | `/login` (student) | Student dashboard  | `/student/*`  |


**JWT** carries `userId`, `role`, and (for org users) `orgId`. All data access is enforced **server-side**; UI route guards are not a security boundary.

---



## 2. Authentication & public access



### 2.1 Landing — `/`


| Feature                | Details                                             |
| ---------------------- | --------------------------------------------------- |
| Marketing home         | Product overview, role sections, feature highlights |
| Navigation             | About, Contact, Login                               |
| Authenticated visitors | Can view while logged in (`allowAuthenticated`)     |




### 2.2 About — `/about`


| Feature                 | Details                      |
| ----------------------- | ---------------------------- |
| Company / product story | Static marketing content     |
| Navigation              | Back to home, contact, login |




### 2.3 Contact — `/contact`


| Feature          | Details                                                      |
| ---------------- | ------------------------------------------------------------ |
| Inquiry form     | First name, last name, email, inquiry type, subject, message |
| Validation       | Email format; subject ≥3 chars; message ≥20 chars            |
| Submit           | `POST /api/contact` — sends inquiry to platform              |
| Success state    | Confirmation UI after submit                                 |
| Contact channels | Display of mail / hours / org info from static config        |




### 2.4 Unified auth — `/login`

**Modes:** Sign in · Sign up  
**Login types:** Organization · Student

#### Organization sign up (`OrgSignupForm`)

Creates **organization + first OrgAdmin** in one step.


| Field              | Required |
| ------------------ | -------- |
| Organization name  | Yes      |
| Organization email | Yes      |
| Password           | Yes      |
| Phone              | No       |
| Address            | No       |


After signup → org login → role-based redirect (OrgAdmin → `/org/dashboard`).

#### Organization sign in (`OrgLoginForm`)


| Capability             | Details                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Email + password login | Returns JWT                                                                                                  |
| Role redirect          | OrgAdmin → `/org/*`; Reviewer → `/reviewer/*`; Subject Expert → `/expert/*`; SuperAdmin → `/admin/dashboard` |
| First-login password   | If `mustChangePassword` → `/welcome` before portal access                                                    |
| Maintenance check      | Blocked users → `/maintenance` with message                                                                  |




#### Student sign up (`StudentSignupForm`)


| Field     | Required |
| --------- | -------- |
| Full name | Yes      |
| Email     | Yes      |
| Password  | Yes      |
| Phone     | No       |
| Address   | No       |


Creates **individual student** (`OrgID` null) unless later linked by org enrollment flow.

#### Student sign in (`StudentLoginForm`)


| Capability        | Details                |
| ----------------- | ---------------------- |
| Email + password  | JWT for student portal |
| Redirect          | `/student/dashboard`   |
| Maintenance check | Same as org login      |




### 2.5 SuperAdmin login — `/admin/login`


| Capability            | Details                                          |
| --------------------- | ------------------------------------------------ |
| Dedicated admin login | Email + password                                 |
| Role gate             | Only `SuperAdmin` proceeds to `/admin/dashboard` |
| Token storage         | `localStorage` (`authToken`, `user`)             |




### 2.6 First-login password change — `/welcome`

**Applies to:** Org users with `MustChangePassword = true` (new OrgAdmin from org creation, users created by admin).


| Field            | Details                                               |
| ---------------- | ----------------------------------------------------- |
| New password     | Min 8 characters                                      |
| Confirm password | Must match                                            |
| Submit           | `completeFirstPassword` API → redirect to role portal |
| Back to sign in  | Logout + home                                         |




### 2.7 Maintenance page — `/maintenance`


| Feature     | Details                                                             |
| ----------- | ------------------------------------------------------------------- |
| Shown when  | Platform maintenance mode enabled and user's role not in allow-list |
| Content     | Custom message, expected resume time from SuperAdmin settings       |
| Scope-aware | Can target all / students / orgs / admins                           |


---



## 3. Shared UI (all authenticated roles)



### 3.1 Notification bell (header)


| Action           | Details                            |
| ---------------- | ---------------------------------- |
| Unread badge     | Polls every 30 seconds             |
| Dropdown preview | Recent notifications               |
| Mark one read    | Per item                           |
| Mark all read    | Bulk                               |
| View all         | → role-specific `/…/notifications` |




### 3.2 Notifications inbox — `/{portal}/notifications`

**Used by:** SuperAdmin, OrgAdmin, Expert, Reviewer, Student


| Filter | Options                                             |
| ------ | --------------------------------------------------- |
| Status | All · Unread · Read                                 |
| Type   | System · Payment · Exam · Result · Reminder · Alert |



| Action            | Details                  |
| ----------------- | ------------------------ |
| Open detail modal | Full message, timestamps |
| Mark as read      | Per notification         |
| Mark all read     | Header action            |
| Delete            | With confirmation        |




### 3.3 Profile — `/{portal}/profile`


| Section              | Details                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Hero                 | Avatar, name, email, role, status tags                                                                                         |
| Account details      | Read-only fields vary by role (org name for OrgAdmin, etc.)                                                                    |
| Personal information | Editable fields gated by API `editable` list: full name, phone, profile image URL, address, father name, gender, date of birth |
| Change password      | Current password + new (≥8) + confirm                                                                                          |




### 3.4 Global announcement banner


| Shown to  | All authenticated portals including **SuperAdmin** (`/admin/*`) |
| --------- | -------------------------------------------------- |
| Source    | SuperAdmin → Settings → Global Announcements       |
| Targeting | By role; optional start/end dates                  |
| Display   | Top banner + optional modal                        |




### 3.5 Layout chrome (all role layouts)


| Feature               | Details                                     |
| --------------------- | ------------------------------------------- |
| Sidebar navigation    | Role-specific menu items                    |
| Mobile                | Collapsible sidebar, overlay tap-to-close   |
| Header                | Page title, notification bell, profile menu |
| Logout                | Clears session, redirects to public/login   |
| Profile menu shortcut | → profile page                              |


---



## 4. SuperAdmin (platform)

**Portal:** `/admin/`*  
**Identity:** `Users` where `Role = SuperAdmin`  
**API prefix:** `/api/admin/`*

### 4.0 Layout navigation


| #   | Menu item             | Route                         | Status                          |
| --- | --------------------- | ----------------------------- | ------------------------------- |
| 1   | Dashboard             | `/admin/dashboard`            | ✅                               |
| 2   | Organizations         | `/admin/organizations`        | ✅                               |
| 3   | Create Organization   | `/admin/create-organization`  | ✅                               |
| 4   | Users                 | `/admin/users`                | ✅                               |
| 5   | Create Platform User  | `/admin/create-platform-user` | ✅                               |
| 6   | Exams & Content       | `/admin/exams`                | ✅                               |
| 7   | Question Bank         | `/admin/questions`            | ✅                               |
| 8   | Subscription Plans    | `/admin/subscription-plans`   | ✅                               |
| 9   | Subscriptions & Usage | `/admin/subscriptions`        | ✅                               |
| 10  | System Logs           | `/admin/logs`                 | ✅                               |
| 11  | Create Notification   | `/admin/create-notification`  | ✅                               |
| 12  | Revenue & Payments    | `/admin/revenue`              | ✅ |
| 13  | System Health         | `/admin/health`               | ✅                               |
| 14  | Settings              | `/admin/settings`             | ✅                               |


*Notifications inbox and profile are via header, not sidebar.*

---



### 4.1 Dashboard — `/admin/dashboard`



#### Controls

- **Refresh** — reload all dashboard data
- **Revenue time range** — 7 / 30 / 90 days (reloads revenue chart)



#### Primary KPI cards (clickable)


| Card                 | Navigates to           |
| -------------------- | ---------------------- |
| Active organizations | `/admin/organizations` |
| Revenue (all time)   | `/admin/subscriptions` |
| Platform users       | `/admin/users`         |
| System health        | `/admin/health`        |




#### Secondary KPI cards (clickable)


| Card            | Navigates to           |
| --------------- | ---------------------- |
| Students        | `/admin/organizations` |
| Questions       | `/admin/questions`     |
| Tests           | `/admin/organizations` |
| Pending reviews | `/admin/questions`     |




#### Charts (read-only, tooltips)

- Revenue area chart (window from selector)
- User sign-ups bar chart (30 days)
- Questions created line chart (30 days)
- Organizations by status pie chart
- Question review pipeline horizontal bar
- Roles distribution pie + legend



#### Panels


| Panel                                    | Actions                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Top organizations by users               | **View all** → Organizations                                                      |
| Capacity snapshot (CPU, latency, status) | **Open health** → System Health                                                   |
| Recent platform activity                 | **View all / Show less** toggle                                                   |
| Quick actions                            | Create organization · Platform user · Subscription plans · System logs · Settings |


---



### 4.2 Organizations — `/admin/organizations`


| Action               | Details                                                             |
| -------------------- | ------------------------------------------------------------------- |
| **Search**           | Name, email, phone, address                                         |
| **View stats**       | Total / Active / Inactive counts                                    |
| **View table**       | Name, email, phone, address, status badge, created date             |
| **Edit** (modal)     | Name, email, phone, address, status (Active / Inactive / Suspended) |
| **Delete** (confirm) | Blocked if org has users                                            |
| **Create org**       | Separate page — not on this screen                                  |


---



### 4.3 Create Organization — `/admin/create-organization`


| Action              | Details                                       |
| ------------------- | --------------------------------------------- |
| **Onboarding tips** | Hover cards; **View all tips** modal          |
| **Create**          | Organization + first OrgAdmin in one API call |


**Organization fields:** Name*, email*, phone, address, status (Active / Inactive / Suspended)

**OrgAdmin fields:** Full name*, password* (min 8), role fixed to OrgAdmin

---



### 4.4 Users — `/admin/users`



#### Filters

- **User type:** All · Platform · Organization
- **Role:** All + dynamic role list
- **Search:** Name, email, phone, org name (org users)



#### Stats

Platform count · Org count · Total active

#### Platform users table


| Action         | Details                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| View           | Name, email, role badge, phone, status, created, last login                                                         |
| Edit (modal)   | Full name, email, phone, role (Reviewer / Subject Expert / SuperAdmin if already SA), status, optional new password |
| Delete (modal) | **Disabled for SuperAdmin rows**                                                                                    |




#### Organization users table


| Action         | Details                |
| -------------- | ---------------------- |
| View           | + Organization column  |
| Edit (modal)   | + OrgAdmin role option |
| Delete (modal) | Delete org user        |


---



### 4.5 Create Platform User — `/admin/create-platform-user`


| Field      | Details                   |
| ---------- | ------------------------- |
| Full name* |                           |
| Email*     |                           |
| Phone      |                           |
| Password*  | Min 8                     |
| Role       | Reviewer · Subject Expert |



| Action     | Details             |
| ---------- | ------------------- |
| Create     | Adds row to `Users` |
| Reset form | On success          |


---



### 4.6 Exams & Content — `/admin/exams`


| Action                  | Details                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **Create exam** (modal) | Name*, description, syllabus notes, expected # subjects; checkbox **Open Setup immediately** |
| **Search**              | Name, description, syllabus                                                                  |
| **Sort**                | Newest · Oldest · Name A–Z · Z–A                                                             |
| **Stats**               | Total exams · With subject plan · Added last 30 days                                         |
| **List**                | Table (desktop) + cards (mobile)                                                             |
| **Setup**               | → `/admin/exams/setup/:examId`                                                               |
| **Edit** (modal)        | Same as create                                                                               |
| **Delete** (confirm)    | Cascades subjects/chapters/topics                                                            |
| **Clear search**        | When no matches                                                                              |


---



### 4.7 Exam Setup — `/admin/exams/setup/:examId`



#### Navigation

- Breadcrumb → Exams list
- **Back to list**



#### Stats (read-only)

Subjects count (vs planned limit) · Chapters · Topics · Weight total %

#### Subjects


| Action                       | Details                                        |
| ---------------------------- | ---------------------------------------------- |
| Expand/collapse subject card |                                                |
| Add subject                  | Name*, weightage %* (total ≤100%), description |
| Edit subject (modal)         | Name, weightage, description                   |
| Delete subject               | Confirm — cascades chapters/topics             |
| Add chapter (inline)         | Number (optional), name (optional)             |
| Edit chapter (inline)        | Number, name, Save/Cancel                      |
| Delete chapter               | Confirm                                        |
| Add topic (inline)           | Name*, optional chapter, description           |
| Edit topic (modal)           | Name, chapter, description                     |
| Delete topic                 | Confirm                                        |


**Constraint:** Subject count capped by exam's `NoOfSubjects`; weight validation across subjects.

---



### 4.8 Question Bank — `/admin/questions`

**Read-only oversight** — no approve/reject/edit/delete in SuperAdmin UI. Question moderation is handled in the **Reviewer** portal (`/reviewer/*`), not here.


| Action        | Details                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| Search        | Question text (form submit)                                                             |
| Filter source | All · Platform · Organizations                                                          |
| Filter status | All · Draft · Pending · Verified · Rejected                                             |
| View table    | Snippet, source, creator, exam/subject/chapter/topic, difficulty, type, status, created |
| Expand row    | Full text, explanation, verified-by, rejection comments, creator                        |
| Paginate      | 25/page                                                                                 |


---



### 4.9 Subscription Plans — `/admin/subscription-plans`

#### Manage Plans (card grid)


| Action                 | Details                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create Plan            | Modal or empty-state CTA                                                                                                                                    |
| Toggle Active/Inactive | Per plan                                                                                                                                                    |
| Edit (modal)           | Name, audience (Org / Student / Both), test modes (Scheduled, Adaptive, Self-Test Builder), price, duration months, feature key/value pairs, computed total |
| Delete (confirm)       |                                                                                                                                                             |
| View                   | Price, duration, audience badge, mode chips, feature tags, linked exam count                                                                                |




#### Overview table


| Action           | Details                                                            |
| ---------------- | ------------------------------------------------------------------ |
| Filters          | Search (plan/exam), min/max price, min/max duration; Clear filters |
| Manage (per row) | Opens **Link Exams** modal                                         |




#### Link Exams modal


| Action            | Details                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Link New Exam     | Select exam, mandatory flag, AI support, max students (disabled for Student-only plans), max tests, max questions/test, max tests/day |
| View linked exams | Limits table                                                                                                                          |
| Edit link         | Nested modal                                                                                                                          |
| Unlink exam       | Confirm                                                                                                                               |
| Done              | Close modal                                                                                                                           |


---



### 4.10 Subscriptions & Usage — `/admin/subscriptions`

**Read-only by design** — view subscription records, usage, and payment history. No cancel, refund, or billing-action UI (handled outside the app until payment gateway integration).


| Action        | Details                                                              |
| ------------- | -------------------------------------------------------------------- |
| Filter status | All · Active · Expired · Cancelled                                   |
| Filter entity | All · Organization · Student                                         |
| Search        | Entity name, email, plan name, subscription ID (client-side on page) |
| Stats         | Total, active, org count, student count, revenue (current page)      |
| Expand row    | Plan details, usage stats, usage by exam, payment history            |
| Paginate      | 50/page server-side                                                  |


---



---

### 4.11 Revenue & Payments — `/admin/revenue`

Revenue dashboard powered by the `Payments` ledger:

| Action | Details |
| ------ | ------- |
| KPI cards | Total revenue, MRR (current month), active subscriptions, completed / failed payments |
| Revenue trend | Area chart — 7 / 30 / 90 day window |
| Breakdowns | By payment method (bar) · by entity type Organization vs Student (pie) |
| Recent payments | Table with date, amount, method, status, transaction id |
| Link | **Subscriptions & Usage** for per-subscription detail |

---

### 4.12 System Logs — `/admin/logs`


| Action               | Details                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh              | Reload logs                                                                                                                                  |
| Export               | **CSV** or **JSON** (filtered page + metadata)                                                                                               |
| Time period          | 7 days · 1 month · 3 months · 1 year · Custom (date pickers)                                                                                 |
| Search               | Description, actor, action, entity, IP (client-side)                                                                                         |
| Filter actor type    | All · User · OrgUser · Organization · Student · System                                                                                       |
| Filter action type   | Login · Logout · Create · Update · Delete · View · Payment · Attempt · Verification · Subscription · ResultGeneration · AIQuestionGeneration |
| Filter entity type   | User · Organization · Student · Test · Question · Subscription · Payment · Result · System                                                   |
| View table           | Timestamp, actor, action, entity, description, IP                                                                                            |
| View details (modal) | Log ID, timestamps, actor, action/entity, IP, user agent, PreviousData/NewData JSON                                                          |
| Paginate             | 50/page                                                                                                                                      |


---



### 4.13 Create Notification — `/admin/create-notification`


| Field    | Details                                             |
| -------- | --------------------------------------------------- |
| Title*   | Max 200 chars                                       |
| Message* | Max 1000 chars                                      |
| Type     | System · Payment · Exam · Result · Reminder · Alert |



| Target audience     | Details                         |
| ------------------- | ------------------------------- |
| Single user/student | Dropdown (platform + org users) |
| All users in org    | Organization picker             |
| All students in org | Organization picker             |
| All platform users  | Broadcast                       |
| All organizations   | Broadcast                       |
| Platform by role    | Reviewer · Subject Expert       |
| Org by role         | Reviewer · Subject Expert       |



| Action | Details                                           |
| ------ | ------------------------------------------------- |
| Send   | Creates N notifications; shows count; resets form |


---



### 4.14 System Health — `/admin/health`


| Action         | Details                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Manual refresh |                                                                                                                   |
| Auto-refresh   | Every 60 seconds                                                                                                  |
| Status cards   | Healthy/degraded, API latency, DB latency, uptime, availability %, error rate, requests, memory                   |
| Charts (24h)   | Requests & errors; API response time; DB response time; CPU/memory %; Platform activity (logins/actions, 14 days) |


**Read-only** — no configuration on this page.

---



### 4.15 Settings — `/admin/settings`



#### Section: Maintenance Mode


| Action                | Details                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| Enable/disable toggle |                                                                                       |
| Scope                 | Entire platform · Student portals · Organizations · Admin tools                       |
| Expected resume       | datetime-local (optional)                                                             |
| Message               | Textarea                                                                              |
| Allowed roles         | Toggle chips: SuperAdmin, OrgAdmin, Reviewer, Subject Expert, Student, Support, Admin |
| Save                  | Persist settings                                                                      |
| Summary table         | Current config preview                                                                |




#### Section: Global Announcements


| Action        | Details                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| Create / New  | Clears form                                                                              |
| Form fields   | Title*, message*, link, starts/ends at, target roles (empty = everyone), active checkbox |
| Save          | Create or update                                                                         |
| Edit (list)   | Load into form                                                                           |
| Delete (list) | Confirm                                                                                  |
| View list     | Title, message, roles, dates, active badge                                               |


---



## 5. OrgAdmin (organization)

**Portal:** `/org/*`  
**Source:** `frontend/src/features/org/pages/*` (routes in `features/org/routes.jsx`)  
**Identity:** `OrgUsers` where `Role = OrgAdmin`  
**API prefix:** `/api/org/*` (OrgAdmin enforced on write endpoints)

**Route access (intentional):** The frontend does **not** scope `/org/*` URLs by org role — any org-authenticated user (`OrgAdmin`, `Reviewer`, `Subject Expert`) can navigate to org routes. **Authorization is enforced on the API**: sensitive writes (users, students, tests, settings, etc.) return **403** unless the caller is `OrgAdmin`. UI route guards are not a security boundary.

### 5.0 Layout navigation


| #   | Menu item           | Route                           |
| --- | ------------------- | ------------------------------- |
| 1   | Dashboard           | `/org/dashboard`                |
| 2   | Explore exams       | `/org/explore-exams`            |
| 3   | Subscription plans  | `/org/subscription-plans`       |
| 4   | Users               | `/org/users`                    |
| 5   | Students            | `/org/students`                 |
| 6   | Exam enrollments    | `/org/student-exam-enrollments` |
| 7   | Groups              | `/org/groups`                   |
| 8   | Tests               | `/org/tests`                    |
| 9   | Questions in Tests  | `/org/test-questions`           |
| 10  | Question Bank       | `/org/question-bank`            |
| 11  | Assigned Tests      | `/org/test-assignments`         |
| 12  | Notifications       | `/org/notifications`            |
| 13  | System Logs         | `/org/logs`                     |
| 14  | Create Notification | `/org/create-notification`      |
| 15  | Settings            | `/org/settings`                 |


*Profile via header. Announcement banner visible in all layouts including SuperAdmin.*

---



### 5.1 Dashboard — `/org/dashboard`


| Feature                | Details                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| Refresh                | Silent reload                                                          |
| Create test            | → `/org/tests/wizard`                                                  |
| Subscription banner    | Active plans or CTA to plans                                           |
| Quick shortcuts        | Explore exams, Plans, Users, Students, Tests, Question bank, Logs      |
| Stat cards (clickable) | Users, Students, Tests (total/active/completed), Groups, Subscriptions |
| Charts (30-day)        | User growth; Tests created; Student attempts                           |
| Snapshot charts        | Role mix pie; Test status bar                                          |
| Recent activity        | Last 8 org logs → View all logs                                        |


---



### 5.2 Explore exams — `/org/explore-exams`


| Feature          | Details                                                          |
| ---------------- | ---------------------------------------------------------------- |
| Refresh catalog  |                                                                  |
| Links            | Subscription plans · Exam enrollments                            |
| Stats            | Total catalog · In your plan · Not in plan · Subscription status |
| Tabs             | Overview · Exam catalog                                          |
| Overview tab     | Access model explanation; CTAs to plans / browse / enrollments   |
| Catalog tab      | Filters: All · In plan · Not in plan; search by name/description |
| Exam cards       | Subject count, description, In plan / Not in plan pill           |
| Per-card actions | In plan → Manage enrollments; Not in plan → Unlock via plans     |


---



### 5.3 Subscription plans — `/org/subscription-plans`


| Feature            | Details                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Stats              | Plans listed · Your active · Ready to subscribe · Coming soon                                |
| Filters            | All · My plans · Available · Coming soon                                                     |
| Active section     | Valid until, auto-renew, Details, Unsubscribe                                                |
| Plan cards         | Price, duration, exam count, verified pool, features, status                                 |
| Subscribe          | Two-step modal: plan review → **simulated payment checkout** (Stripe/JazzCash/Bank); free plans skip payment; creates `Payments` row for paid plans |
| Unsubscribe        | Confirm with impact warnings                                                                 |
| Plan details modal | Full limits per included exam                                                                |


---



### 5.4 Users — `/org/users`


| Action                | Details                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| Stats                 | Total, Reviewers, Experts, Admins, Active                                |
| Search                | Name, email, role                                                        |
| Role filters          | All · Reviewers · Experts · Admins                                       |
| Add user (modal)      | Full name, email, password (≥8), phone, role (Reviewer | Subject Expert) |
| Edit user (modal)     | + status (Active | Inactive | Suspended); optional new password          |
| Delete user (confirm) | Protected: OrgAdmin rows, self                                           |
| Table                 | Name, email, role, status, created, last login                           |


---



### 5.5 Students — `/org/students`


| Action                   | Details                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Register student (modal) | Full name*, email*, password (optional on create), identity no, father name, gender, DOB, address, phone, status |
| Edit student             | Same modal                                                                                                       |
| Delete student           | Confirm                                                                                                          |
| Search                   | Name, email, identity (server-side)                                                                              |
| Pagination               | 20/page                                                                                                          |




#### Bulk register (modal)


| Step                           | Details                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| CSV upload                     | Required: `FullName`, `Email`; optional: Password, IdentityNo, FatherName, Gender, DateOfBirth, Address, Phone, Status |
| Template download              | `students_template.csv`                                                                                                |
| Optional enroll after register | Checkbox + multi-select exams from active subscription                                                                 |
| Submit                         | Register only · Register & enroll                                                                                      |
| Results modal                  | Created, duplicates, registration issues, enrollment issues; expandable tables with row numbers                        |


---



### 5.6 Exam enrollments — `/org/student-exam-enrollments`

**Four tabs:** Bulk assign · Pending requests · Enrollment roster · By student

#### Tab: Bulk assign


| Feature              | Details                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| Exam multi-select    | From subscription exams; Select all / Clear                             |
| Student multi-select | Candidates needing enrollment; search; 100/page; Select visible / Clear |
| Summary              | students × exams pair count                                             |
| Apply enrollments    | Confirm → result card (applied, skipped, errors)                        |




#### Tab: Pending requests


| Action    | Details                               |
| --------- | ------------------------------------- |
| List      | Student, exam, requested time, source |
| Approve   | Per row                               |
| Reject    | Optional note → confirm               |
| All exams | Opens enrollment modal for student    |




#### Tab: Enrollment roster (audit)

| Filters | Student search · Status · Exam · Date range |
| Table | 16 columns including status, source, reviewed by/at, withdrawal info, timestamps |
| Manage | Per-row enrollment actions |
| Pagination | Batch + local 20 rows/page |

#### Tab: By student

- Search + paginated list
- **Manage exams** → `ExamEnrollmentModal`



#### ExamEnrollmentModal (per student)


| Action   | When                             |
| -------- | -------------------------------- |
| Unenroll | Active access → Withdrawn        |
| Enroll   | Withdrawn / Suspended / Rejected |
| Pending  | Read-only; go to Pending tab     |


---



### 5.7 Groups — `/org/groups`


| Action         | Details                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| Create / Edit  | Name*, description, status (Active/Inactive)                                    |
| Delete         | Confirm (removes members)                                                       |
| Search         | Name or description                                                             |
| Card grid      | Member count, status, actions                                                   |
| Manage members | Remove one-by-one; search available students; multi-select **Add Selected (N)** |


---



### 5.8 Tests — `/org/tests`


| Feature           | Details                                                       |
| ----------------- | ------------------------------------------------------------- |
| Subscription gate | Create disabled without active subscription                   |
| Search            | Test or exam name                                             |
| Pagination        | 20/page                                                       |
| Table             | Name, exam, schedule badge, questions, duration, date, status |




#### Per-test row actions


| Action           | Behavior                                    |
| ---------------- | ------------------------------------------- |
| Enable / Disable | Toggle Active ↔ Inactive                    |
| Wizard           | `/org/tests/wizard/:testId`                 |
| Questions        | `/org/tests/:testId/questions` (view + PDF) |
| Assign           | `AssignTestModal`                           |


---



### 5.9 Test Wizard — `/org/tests/wizard` & `/org/tests/wizard/:testId`

**Draft persistence:** `localStorage` (`propath_org_test_wizard_v1`)

**Six steps (sequential gating):** Basics → Binding → Questions → Schedule → Review → Assign


| Step        | ID                    | Requires                     |
| ----------- | --------------------- | ---------------------------- |
| 1 Basics    | Create/edit metadata  | —                            |
| 2 Binding   | Question binding mode | Step 1 (test exists)         |
| 3 Questions | Build / validate      | Step 2 complete              |
| 4 Schedule  | Open vs scheduled     | Step 3 validation passes     |
| 5 Review    | Summary + activate    | Step 4 complete              |
| 6 Assign    | Assign to students    | Step 5 + **Status = Active** |




#### Step 1 — Basics


| Field            | Details                           |
| ---------------- | --------------------------------- |
| Test name*       |                                   |
| Subscription*    | Dropdown if multiple; auto if one |
| Exam*            | From subscription exams           |
| Duration (min)*  | ≥1                                |
| Total questions* | ≥1                                |
| Total marks*     | ≥0                                |
| Save (create)    | Creates Inactive test → step 2    |
| Cancel           | Confirm leave                     |




#### Step 2 — Binding


| Mode       | Description                   |
| ---------- | ----------------------------- |
| **custom** | Hand-pick every question      |
| **auto**   | Random draw at attempt time   |
| **hybrid** | Mix; slider 0–100% auto share |




#### Step 3 — Questions


| Mode   | UI                                     |
| ------ | -------------------------------------- |
| auto   | Checklist only (totals, duration)      |
| custom | Full `TestQuestionsEmbedded`           |
| hybrid | Split banner + embedded custom portion |


**Validation:** auto ≥1 total; custom linked ≥ total; hybrid linked ≥ custom portion ceil

#### Step 4 — Schedule


| Mode          | Fields                                          |
| ------------- | ----------------------------------------------- |
| **open**      | Anytime while active                            |
| **scheduled** | Date* + start time*; end computed from duration |




#### Step 5 — Review

- Read-only summary
- **Status toggle:** Inactive  Active
- Continue to assign (disabled until Active)



#### Step 6 — Assign

- Embedded `AssignTestPanelEmbedded`
- Open full assign dialog
- **Done** → clear draft, go to Tests list

---



### 5.10 Questions in Tests — `/org/test-questions`, `/org/test-questions/:testId`

Standalone flow: pick test from dropdown first.


| Area               | Features                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Summary bar        | Linked vs target; plan max Q/test; binding mode                                                                    |
| Binding section    | Three mode cards; click saves immediately                                                                          |
| Custom/Hybrid bank | Filters: subject, topic, search, difficulty, type, approved only; select all; Add selected (N); pagination 20/page |
| Bulk by topic      | Subject, topic, count 1–100 → random add                                                                           |
| Copy from test     | Same-exam tests; skip duplicates                                                                                   |
| In-test list       | Drag reorder; remove per question                                                                                  |
| Auto UI            | Checklist + link to activate on Tests page                                                                         |


---



### 5.11 View test questions — `/org/tests/:testId/questions`


| Feature            | Details                                             |
| ------------------ | --------------------------------------------------- |
| Display            | Ordered questions, LaTeX, options (✓ correct), meta |
| Export PDF / Print | Print window with styled HTML + KaTeX               |
| Edit               | **Read-only**                                       |


---



### 5.12 Assigned Tests — `/org/test-assignments`


| Feature           | Details                                       |
| ----------------- | --------------------------------------------- |
| Search            | Test or exam name                             |
| List              | Summary columns → View details                |
| Detail view       | Test summary, assignee count, pending count   |
| Assignments table | Student, email, group, type, status, due date |


**Read-only** — assign from Tests list or wizard.

---



### 5.13 Question Bank — `/org/question-bank`

| Filters | Search · Status · Exam · Date range · Clear all |
| Table | Snippet, creator, hierarchy, difficulty, type, status, created |
| Expand row | Full text, explanation, verified-by, rejection comments |
| Delete (confirm) | Blocked if question used in tests |
| Pagination | 25/page |

---



### 5.14 Assign Test (`AssignTestModal` / wizard embedded)



#### Readiness gate (before assign)


| Binding | Rule                                                   |
| ------- | ------------------------------------------------------ |
| auto    | total questions ≥1                                     |
| hybrid  | custom portion linked + totals; 100% auto = auto rules |
| custom  | ≥1 linked question                                     |




#### Assignment modes


| Mode         | UI                                        | API               |
| ------------ | ----------------------------------------- | ----------------- |
| **single**   | Student dropdown (exam-enrolled eligible) | `assign/single`   |
| **multiple** | Searchable checkbox list                  | `assign/multiple` |
| **group**    | Single group dropdown                     | `assign/group`    |
| **groups**   | Multi-checkbox groups                     | `assign/groups`   |
| **all**      | All exam-enrolled students                | `assign/all`      |


**Common:** Optional due date (`datetime-local`)

**Conflict (409):** Replace assignment for single; table + replace for multiple/group conflicts

---



### 5.15 Create Notification — `/org/create-notification`


| Field    | Options                                             |
| -------- | --------------------------------------------------- |
| Title*   | Max 200                                             |
| Type*    | System · Payment · Exam · Result · Reminder · Alert |
| Message* | Max 1000                                            |



| Audience mode    | Behavior                      |
| ---------------- | ----------------------------- |
| **organization** | All org staff                 |
| **allStudents**  | All org students              |
| **orgRole**      | Role + optional specific user |
| **single**       | Role + specific user          |


Live preview aside · Send → reports count created

---



### 5.16 System Logs — `/org/logs`

Org-scoped wrapper on shared Logs component (`orgDashboard` API).

Same capabilities as SuperAdmin logs (filters, export CSV/JSON, detail modal, pagination 50/page) but **organization activity only**.

---



### 5.17 Settings — `/org/settings`

**Tabs:** Enrollment · Account & security · Subscription & usage

#### Enrollment tab


| Setting                          | Options                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| Student exam enrollment requests | On / Off                                                            |
| Approval mode                    | Manual · Auto-approve direct assign · Auto-approve student requests |
| Save                             |                                                                     |
| Pending banner                   | Link to Pending requests when count > 0                             |




#### Account & security tab


| Section         | Fields                     |
| --------------- | -------------------------- |
| Display name    | Editable full name         |
| Change password | Current, new (≥8), confirm |




#### Subscription & usage tab


| Section              | Content                                                      |
| -------------------- | ------------------------------------------------------------ |
| Active plan hero     | Name, status, auto-renew, days remaining, price              |
| Details grid         | Started, valid until, billing, student count                 |
| Auto-renew toggle    | Immediate API                                                |
| Plan capabilities    | Scheduled, Adaptive, Self-test builder badges                |
| Usage summary        | Enrolled, tests created, tests today, attempts, AI questions |
| Included exams table | Per-exam limits + usage + Required/AI flags                  |


---



## 6. Subject Expert

**Portal:** `/expert/`*  
**Identity:** `Users` (platform) or `OrgUsers` (organization) where `Role = Subject Expert`

### 6.0 Layout navigation


| Menu item       | Route                   |
| --------------- | ----------------------- |
| Dashboard       | `/expert/dashboard`     |
| Create Question | `/expert/create`        |
| My Questions    | `/expert/questions`     |
| Performance     | `/expert/performance`   |
| Notifications   | `/expert/notifications` |


*Profile via header. Layout shows "Platform Expert" vs org name.*

---



### 6.1 Dashboard — `/expert/dashboard`


| Feature          | Details                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| KPIs             | Total, verified, pending, drafts, rejected, quality score %, times used |
| Charts           | Status pie; 30-day creation trend                                       |
| Quality panel    | Approval snapshot; accuracy when used                                   |
| Recent questions | Last 5 → My Questions                                                   |
| Quick nav        | Create, My questions, Performance, Notifications                        |
| Refresh          |                                                                         |


**Data scope:**

- **Platform expert:** own questions (`CreatedBy = userId`)
- **Org expert:** all questions where `OrgID = orgId`

---



### 6.2 Create Question — `/expert/create`


| Capability          | Details                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Hierarchy           | Exam → Subject → optional Chapter → Topic (existing / new / none)     |
| Question fields     | Text (LaTeX), difficulty, type (single/multiple), source, explanation |
| Options             | 2–6; mark correct; duplicate-option validation                        |
| Save draft          | Minimal validation                                                    |
| Submit for review   | Full validation → Pending                                             |
| Create topic inline | API when "Create New Topic"                                           |
| Clear form          | Confirm reset                                                         |
| LaTeX editor        | Toggle in localStorage                                                |
| **Bulk CSV**        | Toggle **Bulk CSV** — context dropdowns + template download + preview + commit as Draft or Pending (max 200 rows) |


**Platform vs org:**


|                 | Platform             | Organization                               |
| --------------- | -------------------- | ------------------------------------------ |
| Exam picker     | All exams            | Subscription exams only                    |
| Subscription UI | None                 | Banner: required / expiring / active       |
| Create blocked  | Never (subscription) | 403 without active sub or exam not in plan |
| Ownership       | `OrgID = null`       | `OrgID = orgId`                            |
| Duplicate check | Platform-wide        | Org-scoped                                 |


---



### 6.3 My Questions — `/expert/questions`


| Capability        | Details                                                     |
| ----------------- | ----------------------------------------------------------- |
| List              | With exam/subject/topic context                             |
| Filter tabs       | All, Draft, Pending, Verified, Rejected (+ counts)          |
| Search            | Text, exam, subject, topic                                  |
| Expand card       | Explanation, source, verified date, usage                   |
| View modal        | Full question + LaTeX options                               |
| Edit modal        | Drafts can submit; rejected/verified edits re-queue pending |
| Delete            | Non-verified only; blocked if used in tests                 |
| Reviewer feedback | `ReviewerComments` on rejected                              |


**List scope:** Platform = own only; Org = entire org bank.

---



### 6.4 Performance — `/expert/performance`

Same metrics/charts as dashboard (approval rate, quality score, recent activity). Data scope differs as in §6.1.

---



## 7. Reviewer

**Portal:** `/reviewer/`*  
**Identity:** `Users` (platform) or `OrgUsers` (organization) where `Role = Reviewer`

### 7.0 Layout navigation


| Menu item          | Platform reviewer | Org reviewer          |
| ------------------ | ----------------- | --------------------- |
| Dashboard          | ✅                 | ✅                     |
| Focus Review       | ✅                 | ✅                     |
| Question Review    | ✅                 | ✅                     |
| Expert Performance | ❌ Hidden          | ✅ `/reviewer/experts` |
| Notifications      | ✅                 | ✅                     |


*Focus mode (*`/reviewer/focus`*) uses full-screen shell without sidebar.*

---



### 7.1 Dashboard — `/reviewer/dashboard`


| Feature          | Details                                                      |
| ---------------- | ------------------------------------------------------------ |
| KPIs (clickable) | Pending, Verified, Rejected, Total reviewed, Reviewed by you |
| Charts           | Status bar; 30-day your review activity                      |
| Recent reviews   | Last 5 you reviewed                                          |
| Quick actions    | Focus Review, Review queue, refresh                          |


**Scope:** Platform = all questions; Org = `OrgID` filter only.

---



### 7.2 Question Review — `/reviewer/questions`


| Feature          | Details                                        |
| ---------------- | ---------------------------------------------- |
| Status tabs      | Pending · Verified · Rejected (`?status=` URL) |
| Search + filters | Difficulty, type, exam, subject                |
| Cards            | Preview, metadata, rejection snippet           |
| View modal       | Full question, options, explanation, creator   |
| Approve          | `POST …/approve`                               |
| Reject           | Required comments modal                        |
| Launch Focus     | → `/reviewer/focus`                            |


**Scope:** Platform reviews any org/platform questions; Org limited to own `OrgID`.

---



### 7.3 Focus Review — `/reviewer/focus`

Distraction-free queue (no main layout).


| Feature         | Details                                              |
| --------------- | ---------------------------------------------------- |
| Load queue      | Up to 100 pending                                    |
| Single-screen   | Question, options (correct highlighted), explanation |
| Creator sidebar | Expert name/email                                    |
| Session stats   | Progress %, remaining, approved/rejected/skipped     |
| Approve         | One-click                                            |
| Reject          | Inline required comments                             |
| Skip / Next     | Reorders without deciding                            |
| Complete        | Summary; reload or back to list                      |


---



### 7.4 Expert Performance — `/reviewer/experts` *(org reviewers only)*


| Feature          | Details                                           |
| ---------------- | ------------------------------------------------- |
| Org summary      | Expert count, totals by status, verification rate |
| Per-expert cards | Name, email, status breakdown bar, approval rate  |
| Refresh          |                                                   |


**Platform reviewers:** API returns empty; explanatory empty state if reached via dashboard link.

---



## 8. Student — organization-linked

**Portal:** `/student/`*  
**Identity:** `Students` with `OrgID` set  
**Enrollment type:** Organization

### 8.0 Layout navigation


| Menu item         | Route                    |
| ----------------- | ------------------------ |
| Dashboard         | `/student/dashboard`     |
| My exams          | `/student/my-exams`      |
| Self Test Builder | `/student/self-test`     |
| My Assignments    | `/student/assignments`   |
| Results & reports | `/student/reports`       |
| Notifications     | `/student/notifications` |


*No Subscription Plans page (org manages subscription). Profile via header.*

---



### 8.1 Dashboard — `/student/dashboard`


| Feature          | Details                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| KPIs             | Total assignments, completed, pending, expired/missed, average score %    |
| Charts           | Status pie, recent scores bar, completions by month                       |
| Assignment table | Filter (all / needs action / done / missed), search, open test or results |
| Quick links      | Assignments, Reports                                                      |


May show `unavailableReason` when enrollment or scheduled-mode blocks access.

---



### 8.2 My exams — `/student/my-exams` *(org only)*


| Feature        | Details                                                             |
| -------------- | ------------------------------------------------------------------- |
| List exams     | From org subscription + enrollment row                              |
| Status badges  | Implicit, Approved, Pending, Withdrawn, Rejected, etc.              |
| Leave exam     | Withdraw active enrollment                                          |
| Cancel request | Withdraw pending request                                            |
| Request access | After withdraw/reject → pending (may auto-approve per org settings) |
| Review note    | When rejected                                                       |


---



### 8.3 Self Test Builder — `/student/self-test`


| Feature        | Details                                                |
| -------------- | ------------------------------------------------------ |
| Eligible exams | Subscribed exams with verified pools                   |
| Configure      | Exam, question count (plan limits), duration 5–300 min |
| Live preview   | Subject-wise auto distribution (debounced API)         |
| Create & start | Creates test + assignment → attempt page               |


**Org student:** Uses org subscription; pool scoped to org; errors if Self-Test Builder disabled on plan.

---



### 8.4 Assignments — `/student/assignments`


| Feature     | Details                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| List        | Metadata, due date, window, duration, score if done                     |
| Live status | Pending, Upcoming, In progress, Completed, Expired, Closed, Unavailable |
| Countdowns  | Starts in, time until due/window end                                    |
| Blocks      | `unavailableReason` for enrollment or scheduled mode                    |
| Actions     | Start · Continue · View Results                                         |


---



### 8.5 Test attempt — `/student/test/:testId` *(full page, no layout)*


| Feature            | Details                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| Start/resume       | Creates or resumes attempt                                             |
| Answer UI          | Single/multiple correct; prev/next; skip-for-later queue               |
| Question navigator | Grid: answered / skipped / current                                     |
| Timer              | Open = duration from start; scheduled = min(window end, due, duration) |
| Auto-submit        | On timer expiry                                                        |
| Submit             | Confirm once; scores `StudentAnswers`, `ResultDetails`                 |


**Org gates:** Must match `orgId`; exam enrollment + scheduled mode on plan checked.

---



### 8.6 Results — `/student/test/:testId/results`


| Feature             | Details                                               |
| ------------------- | ----------------------------------------------------- |
| Score hero          | Obtained/total, %, performance band, grade/percentile |
| Context             | Schedule mode, org name, exam, submit time, attempt # |
| Analytics           | Item accuracy, time, cohort rank/percentile           |
| Breakdowns          | By topic, by difficulty                               |
| Per-question review | Selected vs correct, marks earned                     |
| Certificate         | Link if exists                                        |
| Navigation          | Back to assignments or reports                        |


---



### 8.7 Reports — `/student/reports`


| Feature          | Details                          |
| ---------------- | -------------------------------- |
| Summary          | Completed count, average score % |
| Report list      | All completed tests              |
| Open full report | → results page                   |


---



## 9. Student — individual (self-service)

Same portal prefix `/student/*` but **route guards** hide org-only pages and show subscription page.

### 9.0 Layout differences


| Menu item          | Individual | Org student |
| ------------------ | ---------- | ----------- |
| My exams           | ❌          | ✅           |
| Subscription Plans | ✅          | ❌           |


---



### 9.1 Subscription Plans — `/student/subscription-plans` *(individual only)*


| Feature           | Details                                           |
| ----------------- | ------------------------------------------------- |
| Browse plans      | Student/Both audience + Self-Test Builder enabled |
| Filters           | All · My plans · Available · Coming soon          |
| Plan details      | Exams, features, verified pool, test modes        |
| Subscribe         | Two-step modal with simulated payment checkout; free plans activate without payment step |
| Unsubscribe       | → Cancelled                                       |
| Active subs panel | End date, auto-renew, unsubscribe                 |


Org students redirected to dashboard if they navigate here.

---



### 9.2 Other student features

Dashboard, Self-Test Builder, Assignments, Attempt, Results, Reports, Notifications, Profile — **same UI as org student** but:

- **No exam enrollment gate** on assignments (no My exams page)
- **Self-test** requires personal active subscription with Self-Test Builder enabled
- **Subscription** self-managed on Subscription Plans page

---



## 10. Cross-cutting domain concepts



### 10.1 MCQ workflow

```
Draft → Pending → Verified → (used in tests)
           ↓
        Rejected (reviewer comments)
```


| Rule             | Detail                                                      |
| ---------------- | ----------------------------------------------------------- |
| Single correct   | Exactly one `IsCorrect = true`                              |
| Multiple correct | ≥2 correct                                                  |
| Options          | 2–6 non-empty, no duplicate text                            |
| Verified lock    | Cannot edit/delete in expert UI; used-in-test blocks delete |




### 10.2 Exam hierarchy

```
Exam → Subject → Chapter (optional) → Topic (optional)
```

Authored at platform level (SuperAdmin Exam Setup). Org experts create questions within subscribed exams.

### 10.3 Subscription plan dimensions


| Dimension       | Values                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Audience        | Organization · Student · Both                                                                                  |
| Delivery modes  | Scheduled · Adaptive · Self-Test Builder (per-plan toggles)                                                    |
| Per-exam limits | Via `SubscriptionPlanExams`: max students, max tests, max questions/test, max tests/day, mandatory, AI support |




### 10.4 Test configuration


| Concept          | Values                                                       |
| ---------------- | ------------------------------------------------------------ |
| Question binding | custom · auto · hybrid (+ hybrid auto %)                     |
| Schedule mode    | open · scheduled (date + start time)                         |
| Test status      | Active · Inactive (must be Active to assign)                 |
| Assignment types | single · multiple · group · groups · all + optional due date |




### 10.5 Exam enrollment (org students)


| Status    | Meaning                          |
| --------- | -------------------------------- |
| Implicit  | Plan access without explicit row |
| Pending   | Awaiting org approval            |
| Approved  | Can access exams/tests           |
| Rejected  | With reviewer note               |
| Withdrawn | Student or admin left            |
| Suspended | Access blocked                   |


| Source | DirectAssign · StudentRequest |

### 10.6 Audit logging

Logged actions include: Login, Logout, Create, Update, Delete, View, Payment, Attempt, Verification, Subscription, ResultGeneration, AIQuestionGeneration.

Actor types: User, OrgUser, Organization, Student, System.

---



## 11. Platform vs organization — quick matrix


| Feature                    | Platform expert | Org expert         | Platform reviewer | Org reviewer | Individual student | Org student |
| -------------------------- | --------------- | ------------------ | ----------------- | ------------ | ------------------ | ----------- |
| Question visibility        | Own only        | Whole org bank     | All questions     | Org only     | —                  | —           |
| Exam access (authoring)    | All exams       | Subscription exams | —                 | —            | —                  | —           |
| Subscription gate (create) | No              | Yes                | —                 | —            | Own plans          | Org plan    |
| Expert Performance page    | —               | —                  | Empty             | Yes          | —                  | —           |
| My exams page              | —               | —                  | —                 | —            | No                 | Yes         |
| Subscription plans UI      | —               | —                  | —                 | —            | Yes                | No          |
| Exam enrollment on tests   | —               | —                  | —                 | —            | No                 | Yes         |
| Self-test builder          | —               | —                  | —                 | —            | Own sub            | Org sub     |
| Org admin portal           | —               | —                  | —                 | —            | —                  | —           |
| SuperAdmin portal          | —               | —                  | —                 | —            | —                  | —           |


---



## 12. Known gaps & notes

### Intentional design (not gaps)

| Item | Detail |
| ---- | ------ |
| SuperAdmin Question Bank | **View-only** — browse and filter platform/org questions; approve/reject happens in the **Reviewer** portal |
| SuperAdmin Subscriptions | **View-only** — no cancel/refund UI until payment gateway integration |
| `/org/*` route guard | Frontend allows any org-authenticated role to open org URLs; **API enforces OrgAdmin** on sensitive writes |

### Known gaps

| Item | Detail |
| ---- | ------ |
| Live payment gateways | Simulated checkout records `Payments` rows; Stripe/JazzCash webhooks not wired yet |
| Bulk formats beyond CSV | DOCX / LaTeX / PDF parsers planned — **CSV only** in v1 |
| CI smoke placeholders | GitHub Actions uses dummy Supabase/JWT values — not real secrets (intentional) |


