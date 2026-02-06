# 🧱 FINAL COMPLETE DATABASE

# SCHEMA

## 🟦 1️⃣ User & Organization Management

- **Users →** (UserID [PK], FullName, Email UNIQUE, PasswordHash, Role
    ENUM('SuperAdmin','Admin','Reviewer','AI','Support', ‘Subject Expert’), Phone,
    CreatedAt, LastLogin, ProfileImageURL, Status ENUM('Active','Inactive','Suspended')) —
    stores platform-level users such as admins, Subject Expert, AI bots, and reviewers who
    manage global operations.
- **Organizations →** (OrgID [PK], OrgName, OrgEmail, Address, Phone, CreatedBy
    [FK→Users.UserID], CreatedAt, Status ENUM('Active','Inactive')) — stores organization
    (academy/institute) information that subscribes to use the system for conducting exams.
- **OrgUsers →** (OrgUserID [PK], OrgID [FK→Organizations.OrgID], FullName, Email
    UNIQUE, PasswordHash, Role ENUM('OrgAdmin','Reviewer', ‘Subject Expert’), Phone,
    CreatedAt, LastLogin, Status ENUM('Active','Inactive','Suspended')) — stores organization-
    level users (teachers, invigilators, reviewers) who create or manage tests.
- **Students →** (StudentID [PK], OrgID [FK→Organizations.OrgID, Nullable], IdentityNo
    (NIC,PassportNo, OrgReg, Nullable) FullName, FatherName, Email UNIQUE,
    PasswordHash, Gender ENUM('Male','Female','Other'), DateOfBirth, Address, Phone,
    ProfileImageURL, CreatedAt, Status ENUM('Active','Inactive','Suspended')) — stores
    student records; a student may belong to an organization or be self-registered.

```
Note: If a student is enrolled under an organization, they must provide their Organization
Registration Number (OrgReg) — the unique registration ID assigned by that organization
— in the IdentityNo field.
```
- 👥 **StudentGroups →** (GroupID [PK], OrgID [FK→Organizations.OrgID], GroupName,
    Description, CreatedBy [FK→OrgUsers.OrgUserID], CreatedAt, Status
    ENUM('Active','Inactive'))

👤 **StudentGroupMembers →** (GroupID [FK→StudentGroups.GroupID], StudentID

[FK→Students.StudentID], JoinedAt, PK(GroupID, StudentID))

🎓 **Certificates →** (CertificateID [PK], StudentID [FK→Students.StudentID], AttemptID
[FK→StudentAttempts.AttemptID], OrgID [FK→Organizations.OrgID, Nullable], CertificateType

ENUM('Completion','Merit','Participation','Achievement'), IssueDate, CertificateURL, IssuedBy

[FK→OrgUsers.OrgUserID, Nullable], Remarks, Status ENUM('Issued','Revoked','Expired'))


💬 **Feedback →** (FeedbackID [PK], EntityType ENUM('Test','Question','Platform'), EntityID

[UUID, Nullable], StudentID [FK→Students.StudentID], Rating INT, Comment, CreatedAt,

ReviewedBy [FK→OrgUsers.OrgUserID, Nullable], Status ENUM('New','Reviewed','Resolved'))

🏆 **Leaderboard (View) →** (TestID [FK→Tests.TestID], StudentID [FK→Students.StudentID],
ObtainedMarks, Percentile, RankPosition, Grade, OrgID [FK→Organizations.OrgID, Nullable],

GeneratedAt)

## 🟩 2️⃣ Subscription & Usage Management

- **SubscriptionPlans →** (PlanID [PK], PlanName, Price, DurationMonths, Features [JSON])
    — defines available plans (e.g., Basic, Institutional, Enterprise)
- **SubscriptionPlanExams** ( PlanID FK → SubscriptionPlans.PlanID, ExamID FK →
    Exams.ExamID, IsMandatory BOOLEAN DEFAULT FALSE, MaxStudents INT NULL,
    MaxTests INT NULL, MaxQuestionsPerTest INT NULL, MaxTestsPerDay INT NULL,
    AISupport BOOLEAN NULL, ExtraConfig JSON NULL, PK (PlanID, ExamID) )
- **Subscriptions** ( SubscriptionID [PK], EntityType ENUM('Student','Organization'), EntityID
    [UUID], PlanID [FK→SubscriptionPlans.PlanID], StartDate, EndDate, ActivatedAt
    TIMESTAMP NULL, AutoRenew BOOLEAN DEFAULT FALSE, Status
    ENUM('Active','Expired','Cancelled') )
- **UsageCounters** ( UsageID [PK], SubscriptionID [FK→Subscriptions.SubscriptionID],
    ExamID [FK→Exams.ExamID], MonthKey CHAR(7), StudentsEnrolled INT DEFAULT 0,
    TestsCreated INT DEFAULT 0, TestsCreatedToday INT DEFAULT 0, QuestionsCreated
    INT DEFAULT 0, AIQuestionsGenerated INT DEFAULT 0, StudentAttempts INT
    DEFAULT 0, LastResetAt TIMESTAMP NULL, UpdatedAt, UNIQUE (SubscriptionID,
    ExamID, MonthKey) )

## 🟨 3️⃣ Exam & Content Management

- **Exams →** (ExamID [PK], ExamName, CreatedBy , CreatedAt, Description, Syllabus,
    CreatedAt) — defines major exam categories like MDCAT, ECAT, IELTS, etc.
- **Subjects →** (SubjectID [PK], ExamID [FK→Exams.ExamID], SubjectName, Description,
    CreatedBy , CreatedAt,) — defines subjects under each exam.
- **Topics →** (TopicID [PK], SubjectID [FK→Subjects.SubjectID], TopicName, Description,
    CreatedBy , CreatedAt,) — defines detailed topics within subjects for better question
    categorization.
- **Tests** ( TestID [PK], SubscriptionID [FK→Subscriptions.SubscriptionID], ExamID
    [FK→Exams.ExamID], CreatedBy, OrgID [FK→Organizations.OrgID, Nullable],
    TestName, TestType ENUM('Practice','Mock','Final'), DurationMinutes, TotalQuestions,
    TotalMarks, TestDate, StartTime, EndTime, CreatedAt, Status ENUM('Active','Inactive') )
- **Questions →** (QuestionID [PK], TopicID [FK→Topics.TopicID], QuestionText,
    DifficultyLevel ENUM('Easy','Medium','Hard'), Explanation, QuestionType ENUM('Single
    Correct','Multiple Correct'), CreatedBy [FK→Users.UserID], OrgID [FK, Nubble],


```
CreatedAt, IsVerified BOOLEAN, VerifiedBy [FK→Users.UserID, Nullable],
ReviewerComments[Nullable], UpdatedBy [FK→Users.UserID, Nullable], UpdatedAt
[Nullable], VerifiedAt [Nullable], Source ENUM('Self','AI','PastExam'), TimesUsed,
TimesCorrect, TimesIncorrect, LastUpdated) — stores question data with verification and
modification tracking.
```
```
Notes:
```
```
1.UpdatedBy/UpdatedAt capture edits made by others when AI-
generated questions are modified.
```
```
2.The Source field uses standardized naming conventions (e.g.,
MDCAT2025).
```
```
3.CreatedBy, UpdatedBy, VerifiedBy reference Users.UserID.
```
- **Options →** (OptionID [PK], QuestionID [FK→Questions.QuestionID], OptionNumber, OptionText,
    IsCorrect) — stores multiple-choice options for each question. OptionID is the primary key (UUID).
- **TestQuestions →** (TestID [FK→Tests.TestID], QuestionID [FK→Questions.QuestionID],
    Marks, TimeLimit, NegativeMarks, PK(TestID, QuestionID)) — links tests to their
    questions with mark, penalty, and time limit per question.

```
Notes:
```
```
1.Marks defines points for a question (auto-equal if uniform).
```
```
2.NegativeMarks = 0 if no penalty applies.
```
```
3.TimeLimit allows variable question timing.
```
## 🧭 4️⃣ Student Participation & Results

- **StudentAttempts →** (AttemptID [PK], StudentID [FK→Students.StudentID], TestID
    [FK→Tests.TestID], StartTime, EndTime, ObtainedMarks, Grade, Percentile) — stores
    student test attempts and outcomes.

```
Notes:
```
- Each student and test combination gets a unique AttemptID (roll
    number).
- StartTime and EndTime record the attempt duration.
- Short results can be generated directly from this table.
- **StudentAnswers →** (AttemptID [FK→StudentAttempts.AttemptID], QuestionID
[FK→Questions.QuestionID], OptionID [FK→Options.OptionNumber, Nullable],


```
IsCorrect, PK(AttemptID, QuestionID, OptionID)) — records selected options for each
question in a test attempt.
```
- **ResultDetails →** (AttemptID [FK→StudentAttempts.AttemptID], SubjectID
    [FK→Subjects.SubjectID, Nullable], TopicID [FK→Topics.TopicID, Nullable],
    ObtainedMarks, MaxMarks, Percentile) — stores subject- or topic-level details for detailed
    analytics.

```
Note: Functions as a report table but enables generation of comprehensive
analytics and performance tracking.
```
## 💳 5️⃣ Payments & Transactions

- **Payments →** (PaymentID [PK], SubscriptionID [FK→Subscriptions.SubscriptionID],
    EntityType ENUM('Student','Organization'), EntityID [UUID], Amount, Currency,
    PaymentDate, PaymentMethod
    ENUM('CreditCard','BankTransfer','JazzCash','PayPal','Stripe'), TransactionID,
    PaymentStatus ENUM('Pending','Completed','Failed','Refunded'), CreatedAt, Remarks) —
    tracks all payment transactions related to subscriptions for both students and organizations.

```
Note: Supports multiple payment gateways and maintains transaction logs for
reconciliation.
```
## 🔔 6️⃣ Notifications

- **Notifications →** (NotificationID [PK], EntityType ENUM('User','Organization','Student'),
    EntityID [UUID], Title, Message, NotificationType
    ENUM('System','Payment','Exam','Result','Reminder','Alert'), IsRead BOOLEAN
    DEFAULT FALSE, CreatedAt, ReadAt [Nullable]) — stores notifications and alerts for all
    types of entities (students, users, and organizations).

```
Note: Enables both in-app and email notification systems; can be filtered by
unread or type.
```
## 📜 7️⃣ Logs (Comprehensive Audit System)

- **Logs →** (LogID [PK], ActorType ENUM('User','Organization','OrgUser','Student','System'),
    ActorID [UUID], ActionType
    ENUM('Login','Logout','Create','Update','Delete','View','Payment','Attempt','Verification','Su
    bscription','ResultGeneration','AIQuestionGeneration'), EntityType
    ENUM('User','Organization','Student','Test','Question','Subscription','Payment','Result','Syste
    m'), EntityID [UUID, Nullable], Description TEXT, IPAddress, UserAgent, Timestamp
    DEFAULT CURRENT_TIMESTAMP, PreviousData [JSON, Nullable], NewData [JSON,


```
Nullable]) — stores detailed logs and audit trails for every action performed by any user,
student, or organization.
```
```
Notes:
```
```
1.ActorType + ActorID identify who performed the action.
```
```
2.EntityType + EntityID identify on what the action was performed.
```
```
3.PreviousData and NewData allow before-and-after state tracking
(for updates).
```
```
4.IPAddress and UserAgent capture security details.
```
```
5.Supports complete audit trail, accountability, and analytics for all roles.
```
## 🧩 8️⃣ High-Level Relationships Summary

```
From To Relationship Description
Users Organizations 1→∞ Admins create and manage organizations.
```
```
Organizations OrgUsers 1→∞
Each organization has multiple internal
users.
Organizations Students 1→∞ Organizations can enroll multiple students.
Students /
Organizations
Subscriptions 1→∞ Both can have active subscriptions.
```
```
Subscriptions UsageCounters 1→∞ Usage tracked monthly or cumulatively.
```
```
Subscriptions Payments 1→∞
Each subscription can have multiple
payments.
Students StudentAttempts1→∞ Each student can take multiple tests.
```
```
Tests StudentAttempts1→∞
Each test can be attempted by multiple
students.
StudentAttempts StudentAnswers 1→∞ Each attempt records answers per question.
```
```
StudentAttempts ResultDetails 1→∞
Each attempt yields topic-wise/subject-
wise results.
All Entities Notifications 1→∞ All types of users can receive notifications.
```
```
All Entities Logs 1→∞
All entities’ actions are logged for
traceability.
```
## ✅ 9️⃣ 🧭 SYSTEM ACCESS LEVELS & INTERACTION

## FLOWS (Refined Model)

### 1️⃣ Super Admin (System Owner / Platform Controller)

**Scope:** Global (Full Access Across the System)

**Purpose:** Controls the overall platform configuration, plans, organizations, and monitoring.


✅ **Core Functionalities**

- 🔹 Manage system-level users (Users table: Admins, AI bots, Subject Experts,
    Reviewers).
- 🔹 Approve, Reject, update, and delete Organizations.
- 🔹 Define and manage SubscriptionPlans (pricing, duration, features).
- 🔹 Oversee all Subscriptions, Payments, and UsageCounters.
- 🔹 Manage Exam, Subjects, and Topics hierarchy globally.
- 🔹 Monitor all system actions via Logs and Notifications.
- 🔹 Generate global analytics (e.g., number of organizations, active subscriptions,
    payments).
- 🔹 Manage AI Module configuration (model access, question generation limits).
- 🔹 Access audit reports, performance metrics, and suspicious activity logs.
- 🔹 Impersonate or temporarily view an organization’s dashboard (for support purposes).
- Global Moderation Dashboard: View flagged questions or reports from organizations.
- System Health Monitoring: Track latency, uptime, and subscription renewal ratios.
- Global Question Repository: Approve and share verified questions with all organizations.

### 2️⃣ Organization (Tenant / Institutional User)

**Scope:** Limited to its own domain (multi-tenant model).

**Purpose:** Acts as an institute that manages students, internal users, and tests using its subscription.

✅ **Core Functionalities**

- 🏢 **Organization Admin**
    - Manage OrgUsers (Subject Experts, Reviewers).
    - Enroll and manage Students under its organization.
    - Create and manage exams, subjects, topics (local scope if needed).
    - Create and schedule Tests (Practice, Mock, Final).
    - Assign Subject Experts or AI module for question generation.
    - Assign Reviewers for verification of questions.
    - Track test progress, performance, and student analytics.
    - View Subscriptions, UsageCounters, and Payments.
    - Generate reports (test-wise, subject-wise, student-wise performance).
    - Send system Notifications to students and staff.


- View and download comprehensive analytics dashboards.
- Maintain audit trail through organization-specific Logs.

👨‍🏫 **Organization-Level Subject Experts**

- Create, update, and verify questions.
- Collaborate with AI module (edit or approve AI-generated questions).
- Review peer questions and suggest improvements.
- Tag questions by difficulty and source.
- Create question pools by topic for future tests.

👀 **Organization-Level Reviewers**

- Review and verify submitted questions.
- Approve or reject AI/Subject Expert questions.
- Validate difficulty levels and mark correctness.
- Provide review comments (stored in Logs or ReviewNotes table if added).
- Track question verification performance.

🎓 **Organization Students**

- Appear in assigned or scheduled tests.
- View personal performance dashboards (subject- and topic-level analytics).
- Track cumulative progress and percentile trends.
- View comparative rankings within the organization.
- Receive notifications about test schedules and results.
- Participate in adaptive learning or remedial modules (if integrated).

💡 **Additional Functionalities for Organizations**

1. **Student Grouping:** Create batches or sections to assign specific tests to student groups.
2. **Test Reuse & Cloning:** Copy or reuse previous tests across sessions.
3. **Result Comparison:** Compare performance of different classes or sessions.
4. **Question Bank Analytics:** Identify most/least attempted questions, high-error questions.
5. **Certificate Generator:** Automatically generate completion or merit certificates.
6. **Report Export:** Export reports in PDF/Excel for institutional records.
7. **Plagiarism / Duplication Check:** Detect duplicate questions among organization experts.
8. **Internal Review Workflow:** Multi-step review system for sensitive exams (optional).


### 3️⃣ Student (Independent or Organizational)

**Scope:**

- **Independent Students:** Full access under personal subscription.
- **Organizational Students:** Access controlled by organization.

✅ **Core Functionalities (for Both)**

- 🧾 Register / Login / Manage Profile (Students table).
- 📘 Attempt available Tests (Practice, Mock, Final).
- 📊 View Test Results (StudentAttempts, ResultDetails).
- 🧠 Review Correct/Incorrect Questions with Explanations.
- 🔍 Track Progress by subject, topic, and percentile.
- 🧩 Receive Notifications (results, reminders, new tests).
- 💳 Manage personal Subscription, Generate Tests, Conduct Tests,
    Manage Tests (for independent students).
- 📈 View current usage, plan expiry, and remaining quota (for independent students).
- 💾 Export results or analytics reports.
- **Personalized Learning Recommendations:** AI suggests topics for revision based on weak
    areas.
- **Self-Test Builder:** Create custom tests by choosing topics/difficulty. (for independent
    students).
- **Performance Analytics Dashboard:** Visualize percentile trends, topic
    strengths/weaknesses.
- **AI Tutor / Chat-based Assistance:** Ask explanations for wrong answers.
- **Gamified Progress Badges:** Earn badges for milestones (consistency, accuracy, time-
    efficiency).
- **Peer Benchmarking (Optional):** Compare performance with peers anonymously.

### 4️⃣ Subject Expert (Global or Organizational)

**Scope:** Can be platform-wide (SuperAdmin-controlled) or organization-bound.

✅ **Core Functionalities**

- ✍️ Create and update questions with detailed explanations and metadata (Topic, Difficulty,
    Type).
- 👀 Review questions created by others (peer review).
- 💬 Suggest improvements to AI-generated or human-created questions.


- ✅ Approve or reject AI-generated questions.
- 📂 Manage question tags (e.g., cognitive level, Bloom taxonomy, source exam).
- 🔍 Track personal contribution metrics (questions created, approved, or rejected).
- 🗂️ Export or import question sets in bulk (Excel/CSV upload for institutions).

💡 **Additional Suggested Features**

- **Collaborative Question Review Board:** Allow threaded feedback among experts.
- **AI-Assisted Question Enhancement:** Suggest better phrasing or distractors using AI.
- **Performance Analytics for Experts:** Evaluate accuracy of verified questions after use in
    tests.

# ✅ 1. FUNCTIONALITY MATRIX (Role vs

# Features)

A comprehensive table showing **which roles can access or perform which features** in the system.

### Legend

- ✔ = Full Access
- ● = Limited / Conditional Access
- ✖ = No Access

## Role–Feature Access Matrix

```
Feature /
Module
```
```
SuperA
dmin
```
```
Org
Adm
in
```
```
Subject
Expert
Reviewer
Student
(Org)
```
```
Student
(Independe
nt)
```
#### AI

```
Module
Support
```
```
User
Managem
ent (Users
table)
```
```
✔ ✖ ✖ ✖ ✖ ✖ ✖ ✔ (read)
```
```
Organizat
ion
Managem
ent
```
#### ✔

#### ●

```
(own
org)
```
```
✖ ✖ ✖ ✖ ✖ ● (read)
```
```
OrgUsers
Managem
ent
```
#### ✔

#### ✔

```
(own
org)
```
```
✖ ✖ ✖ ✖ ✖ ● (read)
```
```
Students
(Enrollme
nt)
```
#### ✔

```
✔(o
wn
org)
```
```
✖ ✖ ● (self) ✔(self) ✖ ● (read)
```

```
Feature /
Module
```
```
SuperA
dmin
```
```
Org
Adm
in
```
```
Subject
Expert
Reviewer
Student
(Org)
```
```
Student
(Independe
nt)
```
#### AI

```
Module
Support
```
**Subscripti
on Plans
(global)**

```
✔ ✖ ✖ ✖ ✖ ✖ ✖ ● (read)
```
**Subscripti
ons
(assign /
renew)**

#### ✔

#### ✔

```
(org
only)
```
```
✖ ✖ ✖ ✔ (self) ✖ ● (read)
```
**Payments** ✔

#### ✔

```
(org)
✖ ✖ ✖ ✔ (self) ✖ ● (read)
```
**Exams** ✔ ✖ ✖ ✖ ✖ ✖ ✖ ● (read)

**Subjects** ✔ ✖ ✖ ✖ ✖ ✖ ✖ ● (read)

Topics ✔

```
✔(o
rg
Only)
```
```
✔(Subje
ct level)
```
#### ●

```
(Review)
✖ ✖ ✖ ● (read)
```
**Question
Creation**

#### ✔

#### ●

```
(local
)
```
#### ✔ ✖ ✖ ✖

#### ✔ (AI

```
generatio
n)
```
```
● (read)
```
**Question
Editing**

#### ✔

#### ●

```
(local
)
```
#### ✔ ✖ ✖ ✖

```
● (auto-
correctio
n)
```
```
● (read)
```
**Question
Verificatio
n**

#### ✔

```
●(loc
al)
✖ ✔ ✖ ✖ ✖ ● (read)
```
#### AI

**Question
Generatio
n**

#### ✔

```
●(loc
al)
```
#### ✔ ✖ ✖ ✖ ✔

```
● (monitor
only)
```
**Test
Creation**

#### ✔

```
●(loc
al)
✖ ✖ ✖ ●(for self) ✖ ●
```
**Test
Schedulin
g /
Assigning**

#### ✔

```
●(loc
al) ✖ ✖ ✖ ● (self) ✖ ●
```
**Attempt
Tests**

#### ✖ ✖ ✖ ✖ ✔ ✔ ✖ ✖

**View
Results /
Analytics**

#### ✔

```
●(loc
al)
✖ ✖ ● (self) ● (self) ✖ ●
```
**Leaderbo
ard &
Performa
nce
Analytics**

#### ✔

```
●(loc
al)
✖ ✖ ● (self) ● (self) ✖ ●
```
**Certificat
es** ✔

```
●(loc
al) ✖ ✖ ✖ ● (self) ✖ ●
```
**Notificatio** ✔ ●(loc● ● ✖ ✖ ● ●


```
Feature /
Module
```
```
SuperA
dmin
```
```
Org
Adm
in
```
```
Subject
Expert
Reviewer
Student
(Org)
```
```
Student
(Independe
nt)
```
#### AI

```
Module
Support
```
**ns** al)

**Logs
(Audit
Trail)**

#### ✔

#### ●

```
(own
org)
```
```
✖ ✖ ✖ ✖ ✖ ✔ (read-only)
```
**System
Health &
Monitorin
g**

#### ✔ ✖ ✖ ✖ ✖ ✖ ✖ ✔

**Imperson
ation
(Support
Mode)**

#### ✔ ✖ ✖ ✖ ✖ ✖ ✖ ✔

**Export
Reports**

#### ✔

#### ●

```
(own
org)
```
#### ● ●

#### ●

```
(limited
)
```
```
✔ (self) ✖ ✔
```

