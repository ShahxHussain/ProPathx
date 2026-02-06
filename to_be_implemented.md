# Features To Be Implemented

## Table of Contents
1. [Overview](#overview)
2. [Feature 1: MCQ Addition by Subject Expert](#feature-1-mcq-addition-by-subject-expert)
3. [Feature 2: MCQ Review by Reviewer](#feature-2-mcq-review-by-reviewer)
4. [Feature 3: Rejection Rollback System](#feature-3-rejection-rollback-system)
5. [Feature 4: MCQ Binding to Test](#feature-4-mcq-binding-to-test)
6. [Feature 5: Subscription Enable/Disable Toggle](#feature-5-subscription-enabledisable-toggle)
7. [Feature 6: Registered Student Login](#feature-6-registered-student-login)
8. [Feature 7: Student Dashboard and Analytics](#feature-7-student-dashboard-and-analytics)
9. [Feature 8: Student Notification System Refinement](#feature-8-student-notification-system-refinement)
10. [Implementation Priority](#implementation-priority)
11. [Database Schema Changes Required](#database-schema-changes-required)
12. [API Endpoints Required](#api-endpoints-required)
13. [UI/UX Considerations](#uiux-considerations)

---

## Overview

This document outlines the features that need to be implemented to complete the ProPath examination platform. These features focus on question management workflows, student experience, and administrative controls.

**Status**: Planning Phase  
**Last Updated**: [Current Date]

---

## Feature 1: MCQ Addition by Subject Expert

### Description
Subject Experts (OrgUsers with role 'Subject Expert') should be able to create and upload MCQs (Multiple Choice Questions) for exams that their organization has subscribed to. The system must restrict question creation to only those exams that are linked to the organization's active subscription plan.

### Requirements

#### Functional Requirements
1. **Access Control**
   - Only users with role 'Subject Expert' can create questions
   - Subject Expert must belong to an organization (`OrgUsers.OrgID`)
   - Subject Expert can only create questions for exams linked to their organization's active subscription

2. **Exam/Subscription Validation**
   - Verify organization has an active subscription (`Subscriptions.Status = 'Active'`)
   - Verify exam is linked to the subscription plan via `SubscriptionPlanExams`
   - Check subscription `EndDate` to ensure it hasn't expired

3. **Question Creation Workflow**
   - Subject Expert selects an exam from available subscribed exams
   - Selects subject and topic within that exam
   - Creates question with:
     - Question text
     - Question type (Single Correct / Multiple Correct)
     - Difficulty level (Easy / Medium / Hard)
     - Explanation
     - Multiple options (minimum 2, typically 4-5)
     - Mark correct option(s)
   - Question is created with status: `IsVerified = false`
   - Question `CreatedBy` references `OrgUsers.OrgUserID` (not `Users.UserID`)
   - Question `Source` = 'Self'
   - Question `OrgID` should be set to the Subject Expert's organization

4. **Question Ownership**
   - Questions created by Subject Expert are organization-specific
   - `Questions.OrgID` = Subject Expert's `OrgID`
   - These questions can be used by the organization for their tests

#### Technical Requirements
- Database: Ensure `Questions` table has `OrgID` column (may need migration)
- Backend: Validate subscription and exam linkage before allowing question creation
- Frontend: Filter available exams based on active subscription
- API: Create endpoint for Subject Expert to list available exams for question creation

#### Business Rules
- Subject Expert cannot create questions for exams not in their subscription
- Questions are initially unverified (`IsVerified = false`)
- Questions must go through review process before being used in tests
- Organization-specific questions are private to that organization

---

## Feature 2: MCQ Review by Reviewer

### Description
Reviewers (OrgUsers with role 'Reviewer') should be able to review MCQs created by Subject Experts. Reviewers can approve or reject questions, with the ability to provide comments.

### Requirements

#### Functional Requirements
1. **Access Control**
   - Only users with role 'Reviewer' can review questions
   - Reviewer must belong to an organization
   - Reviewer can only review questions from their own organization (`Questions.OrgID = Reviewer.OrgID`)

2. **Question Review Workflow**
   - Reviewer views list of unverified questions (`IsVerified = false`)
   - Questions are filtered by organization
   - Reviewer can filter by:
     - Exam
     - Subject
     - Topic
     - Difficulty level
     - Created date
     - Created by (Subject Expert)
   - Reviewer views question details:
     - Question text
     - Options
     - Correct answer(s)
     - Explanation
     - Difficulty level
     - Created by (Subject Expert name)
     - Created date

3. **Review Actions**
   - **Approve**: 
     - Set `IsVerified = true`
     - Set `VerifiedBy = Reviewer.OrgUserID`
     - Set `VerifiedAt = current timestamp`
     - Question becomes available for use in tests
   - **Reject**:
     - Set `IsVerified = false` (remains false)
     - Set `VerifiedBy = null`
     - Set `ReviewerComments = rejection reason/comments`
     - Question is rolled back to Subject Expert (see Feature 3)

4. **Review Comments**
   - Reviewer can add comments explaining approval or rejection
   - Comments stored in `Questions.ReviewerComments`
   - Comments visible to Subject Expert when question is rejected

#### Technical Requirements
- Backend: Query unverified questions filtered by organization
- Backend: Update question verification status
- Frontend: Review interface with question display and action buttons
- API: Endpoints for listing reviewable questions and updating review status

#### Business Rules
- Only unverified questions can be reviewed
- Once approved, question cannot be reviewed again (unless updated)
- Rejected questions can be resubmitted by Subject Expert after corrections

---

## Feature 3: Rejection Rollback System

### Description
When a Reviewer rejects a question, the system should automatically notify the Subject Expert who created it and make the question visible to them for correction and resubmission.

### Requirements

#### Functional Requirements
1. **Rejection Workflow**
   - When Reviewer rejects a question:
     - Question status remains `IsVerified = false`
     - `ReviewerComments` is populated with rejection reason
     - `VerifiedBy` remains `null`
     - Question is marked as "Needs Revision" or similar status

2. **Subject Expert Notification**
   - Create notification for the Subject Expert who created the question
   - Notification type: 'Alert' or 'System'
   - Notification message: "Your question has been rejected. Please review comments and resubmit."
   - Include link to question details and reviewer comments

3. **Subject Expert View**
   - Subject Expert sees rejected questions in a dedicated section
   - Can view:
     - Original question
     - Reviewer comments/rejection reason
     - Rejection date
   - Can edit and resubmit the question
   - After resubmission, question goes back to review queue

4. **Question Status Tracking**
   - Track question revision history (may need new table or use `UpdatedAt`, `UpdatedBy`)
   - Show number of revisions/rejections
   - Prevent infinite rejection loops (optional: limit revisions)

#### Technical Requirements
- Database: May need to add `RevisionCount` or `RejectionCount` to `Questions` table
- Backend: Notification creation on rejection
- Backend: Query rejected questions for specific Subject Expert
- Frontend: "Rejected Questions" view for Subject Expert
- Frontend: Edit and resubmit functionality

#### Business Rules
- Only the original creator (Subject Expert) can edit rejected questions
- Rejected questions are not available for test creation
- After resubmission, question status resets to unverified

---

## Feature 4: MCQ Binding to Test

### Description
When creating a test, OrgAdmin should be able to bind MCQs to the test in two modes:
1. **Manual Mode**: Select questions from organization's own question bank (questions created by their Subject Experts)
2. **Auto Addition Mode**: Automatically add questions from platform-wide verified question bank based on predefined criteria (subject-wise distribution, difficulty level, etc.)

### Requirements

#### Functional Requirements

##### Manual Mode - Own MCQs
1. **Question Selection**
   - OrgAdmin selects questions from organization's question bank
   - Filter questions by:
     - Exam (must match test's exam)
     - Subject
     - Topic
     - Difficulty level
     - Question type
     - Verification status (only verified questions)
   - Questions must have `OrgID = Organization's OrgID`
   - Questions must have `IsVerified = true`
   - Questions must belong to the same exam as the test

2. **Selection Interface**
   - Display question preview (text, options, correct answer)
   - Allow bulk selection
   - Show selected count
   - Validate total questions match `Tests.TotalQuestions`

##### Auto Addition Mode - Platform-Wide MCQs
1. **Criteria Configuration**
   - OrgAdmin configures auto-addition criteria:
     - Subject-wise distribution (e.g., 30% Physics, 30% Chemistry, 40% Biology)
     - Difficulty level distribution (e.g., 20% Easy, 60% Medium, 20% Hard)
     - Question type preference (Single Correct / Multiple Correct)
     - Total number of questions

2. **Question Selection Algorithm**
   - System queries platform-wide verified questions:
     - `Questions.OrgID IS NULL` (platform-wide questions)
     - `Questions.IsVerified = true`
     - `Questions.TopicID` belongs to subjects in the test's exam
     - Matches difficulty distribution
     - Matches subject distribution 
   - Randomly selects questions meeting criteria
   - Ensures no duplicate questions in test

3. **Hybrid Mode** (Optional Enhancement)
   - Allow mix of manual and auto-addition
   - OrgAdmin selects some questions manually
   - System fills remaining slots automatically

#### Technical Requirements
- Backend: Query organization's question bank
- Backend: Query platform-wide verified questions
- Backend: Algorithm for auto-selection based on criteria
- Backend: Validate question selection (exam match, verification status)
- Frontend: Question selection interface with filters
- Frontend: Auto-addition configuration form
- API: Endpoints for querying questions and binding to tests

#### Database Considerations
- `TestQuestions` table already exists for binding
- Need to ensure questions are linked correctly
- Track question source (organization vs platform-wide)

#### Business Rules
- Manual mode: Only verified organization questions can be used
- Auto mode: Only verified platform-wide questions can be used
- Questions must belong to the same exam as the test
- Total questions in test must match `Tests.TotalQuestions`
- Questions cannot be duplicated within a test

---

## Feature 5: Subscription Enable/Disable Toggle

### Description
SuperAdmin should be able to enable or disable subscriptions for organizations. This provides administrative control to temporarily suspend or reactivate organization access.

### Requirements

#### Functional Requirements
1. **Toggle Functionality**
   - SuperAdmin can toggle subscription status
   - Toggle affects `Subscriptions.Status` field
   - Status values: 'Active', 'Inactive', 'Expired', 'Cancelled'
   - Toggle between 'Active' and 'Inactive' (or 'Cancelled')

2. **Access Control**
   - Only SuperAdmin can toggle subscription status
   - SuperAdmin can view all subscriptions
   - Filter subscriptions by organization, plan, status

3. **Impact of Disabling**
   - When subscription is disabled:
     - Organization cannot create new tests
     - Organization cannot assign tests
     - Organization cannot register new students (optional)
     - Existing tests may remain accessible (based on business rules)
   - When subscription is re-enabled:
     - All features become available again
     - Usage counters remain intact

4. **UI/UX**
   - Toggle switch/button in subscription management interface
   - Confirmation dialog before disabling
   - Visual indicator of subscription status
   - Notification to organization when subscription is disabled/enabled

#### Technical Requirements
- Backend: Update `Subscriptions.Status` field
- Backend: Validation in test creation/assignment endpoints to check subscription status
- Frontend: Toggle UI component in SuperAdmin subscription management
- API: Endpoint to update subscription status
- Notifications: Send notification to organization when status changes

#### Business Rules
- Disabling subscription does not delete subscription data
- Disabling subscription does not affect existing test assignments (may need clarification)
- Re-enabling restores full access
- SuperAdmin should provide reason for disabling (optional: add `DisableReason` field)

---

## Feature 6: Registered Student Login

### Description
Students registered in the system should be able to log in using their credentials (email and password) to access their dashboard and take assigned tests.

### Requirements

#### Functional Requirements
1. **Authentication**
   - Student login using `Students.Email` and password
   - Password verification using `Students.PasswordHash`
   - JWT token generation upon successful login
   - Token includes: `StudentID`, `OrgID`, `Role: 'Student'`

2. **Login Validation**
   - Verify email exists in `Students` table
   - Verify password matches hash
   - Verify student status is 'Active'
   - Verify student belongs to an organization

3. **Session Management**
   - Store JWT token in frontend (localStorage/sessionStorage)
   - Include token in API requests
   - Token expiration handling
   - Logout functionality

4. **Redirect After Login**
   - Redirect to Student Dashboard
   - Route: `/student/dashboard` or similar

#### Technical Requirements
- Backend: Student authentication endpoint (`POST /api/student/auth/login`)
- Backend: JWT token generation with student claims
- Backend: Middleware to verify student JWT tokens
- Frontend: Student login form
- Frontend: Student authentication context/state management
- Frontend: Protected routes for student pages
- API: Student API service methods

#### Database Considerations
- `Students` table already has `Email`, `PasswordHash`, `Status`
- `Students.LastLogin` should be updated on successful login

#### Business Rules
- Only active students can log in
- Students can only access their own organization's data
- Failed login attempts should be logged (optional: rate limiting)

---

## Feature 7: Student Dashboard and Analytics

### Description
Registered students should have a comprehensive dashboard showing their test assignments, performance analytics, and organization-specific details.

### Requirements

#### Functional Requirements

##### Dashboard Overview
1. **Key Statistics**
   - Total tests assigned
   - Tests completed
   - Tests pending
   - Tests expired
   - Average score
   - Overall percentile

2. **Upcoming Tests**
   - List of assigned tests with:
     - Test name
     - Exam name
     - Test date and time
     - Due date
     - Status (Pending, In Progress, Completed, Expired)
     - Duration
   - Sort by: Date, Status, Priority

3. **Recent Activity**
   - Recently completed tests
   - Recent test attempts
   - Recent results

4. **Performance Summary**
   - Overall performance metrics
   - Subject-wise performance
   - Topic-wise performance
   - Improvement trends

##### Analytics Section
1. **Test Performance Analytics**
   - Test-wise scores and grades
   - Subject-wise breakdown
   - Topic-wise breakdown
   - Difficulty level performance

2. **Progress Tracking**
   - Progress over time (line chart)
   - Score trends
   - Completion rate
   - Time spent on tests

3. **Comparative Analytics** (Optional)
   - Performance compared to organization average
   - Percentile ranking within organization
   - Subject strengths and weaknesses

4. **Detailed Reports**
   - View detailed results for each test attempt
   - Question-wise analysis (correct/incorrect)
   - Review explanations for incorrect answers
   - Download reports (PDF/CSV)

##### Organization-Specific Details
1. **Organization Information**
   - Organization name
   - Organization contact details
   - Assigned groups (if applicable)

2. **Test Assignments**
   - Filter by test type (Practice, Mock, Final)
   - Filter by status
   - Filter by exam
   - Search functionality

3. **Group Information** (if student belongs to groups)
   - Group name(s)
   - Group members (if allowed)
   - Group performance (if allowed)

#### Technical Requirements
- Backend: Query test assignments for student (`TestAssignments.StudentID`)
- Backend: Query test attempts and results (`StudentAttempts`, `ResultDetails`)
- Backend: Calculate analytics and aggregations
- Frontend: Dashboard layout with cards and charts
- Frontend: Test list with filters and search
- Frontend: Analytics charts (using Recharts)
- Frontend: Detailed result views
- API: Endpoints for student dashboard data, test assignments, attempts, results

#### Database Queries Required
- Join `TestAssignments` with `Tests`, `Exams`
- Join `StudentAttempts` with `Tests`, `ResultDetails`
- Aggregate data for analytics
- Filter by `StudentID` and `OrgID`

#### Business Rules
- Students can only view their own data
- Students can only view tests assigned to them
- Students cannot view other students' performance (unless aggregate/anonymous)
- Organization-specific data is isolated

---

## Feature 8: Student Notification System Refinement

### Description
The current notification system needs to be refined for students. Students should receive notifications for test assignments, test reminders, results, and other relevant updates.

### Requirements

#### Functional Requirements

##### Notification Types for Students
1. **Test Assignment Notifications**
   - Notification when test is assigned
   - Include: Test name, exam, due date, test date/time
   - Notification type: 'Exam'

2. **Test Reminder Notifications**
   - Reminder before test start time (e.g., 1 hour before, 1 day before)
   - Reminder for upcoming due dates
   - Notification type: 'Reminder'

3. **Result Notifications**
   - Notification when test result is available
   - Include: Test name, score, grade, percentile
   - Notification type: 'Result'

4. **System Notifications**
   - General system updates
   - Organization announcements
   - Notification type: 'System'

5. **Alert Notifications**
   - Important alerts (test expiring soon, missed test, etc.)
   - Notification type: 'Alert'

##### Notification Delivery
1. **Real-Time Updates**
   - Notifications appear in notification bell
   - Unread count badge
   - Auto-refresh notification list

2. **Notification Preferences** (Optional Enhancement)
   - Allow students to configure notification preferences
   - Email notifications (if email integration exists)
   - In-app notifications

3. **Notification Actions**
   - Mark as read
   - Mark all as read
   - Delete notification
   - Click notification to navigate to relevant page

##### Notification Creation Triggers
1. **Automatic Notifications**
   - When test is assigned to student (via `TestAssignments`)
   - When test result is generated (via `StudentAttempts`)
   - When test is about to start (scheduled reminder)
   - When test due date is approaching

2. **Manual Notifications**
   - OrgAdmin can send notifications to students
   - Organization-wide announcements

#### Technical Requirements
- Backend: Create notifications when test is assigned
- Backend: Create notifications when test attempt is completed
- Backend: Scheduled job/cron for reminder notifications (optional)
- Backend: Query notifications for student (`Notifications.EntityType = 'Student'`, `EntityID = StudentID`)
- Frontend: Student notification bell component (similar to existing)
- Frontend: Notification list page for students
- API: Student notification endpoints (may reuse existing with student context)

#### Database Considerations
- `Notifications` table already supports student notifications
- `EntityType = 'Student'`, `EntityID = StudentID`
- May need to add notification templates or categories

#### Business Rules
- Students only receive notifications relevant to them
- Notifications are organization-scoped (students only see their org's notifications)
- Test assignment notifications are sent immediately upon assignment
- Result notifications are sent when test attempt is completed and graded

---

## Implementation Priority

### Phase 1: Core Question Management (High Priority)
1. **Feature 1**: MCQ Addition by Subject Expert
2. **Feature 2**: MCQ Review by Reviewer
3. **Feature 3**: Rejection Rollback System

**Rationale**: These features form the core question management workflow and are essential for content creation and quality control.

### Phase 2: Test Creation Enhancement (High Priority)
4. **Feature 4**: MCQ Binding to Test

**Rationale**: Enables complete test creation workflow with question selection.

### Phase 3: Student Experience (Medium Priority)
5. **Feature 6**: Registered Student Login
6. **Feature 7**: Student Dashboard and Analytics
7. **Feature 8**: Student Notification System Refinement

**Rationale**: Completes the student-facing functionality and improves user experience.

### Phase 4: Administrative Controls (Low Priority)
8. **Feature 5**: Subscription Enable/Disable Toggle

**Rationale**: Administrative feature that can be implemented after core functionality is complete.

---

## Database Schema Changes Required

### 1. Questions Table Enhancement
```sql
-- Add OrgID to Questions table if not exists
ALTER TABLE "Questions" 
ADD COLUMN IF NOT EXISTS "OrgID" uuid REFERENCES "Organizations"("OrgID") ON DELETE SET NULL;

-- Add index for OrgID
CREATE INDEX IF NOT EXISTS "idx_questions_orgid" ON "Questions"("OrgID");

-- Add RevisionCount for tracking revisions
ALTER TABLE "Questions" 
ADD COLUMN IF NOT EXISTS "RevisionCount" integer DEFAULT 0;

-- Add Status field for better tracking (optional)
-- Values: 'Draft', 'Pending Review', 'Approved', 'Rejected', 'Revised'
ALTER TABLE "Questions" 
ADD COLUMN IF NOT EXISTS "QuestionStatus" text DEFAULT 'Pending Review';
```

### 1a. Options Table Enhancement (Already Implemented)
```sql
-- OptionID has been added as primary key to Options table
-- Options table now uses OptionID (UUID) as primary key instead of composite (QuestionID, OptionNumber)
-- StudentAnswers table references OptionID as UUID instead of int
```

### 1b. QuestionMedia Table (Already Implemented)
```sql
-- QuestionMedia table has been created to support media attachments for questions
-- Supports images, diagrams, and charts for questions, options, and explanations
-- See Database_Schema.md for full table definition
```

### 2. Questions CreatedBy Reference
```sql
-- Note: Questions.CreatedBy currently references Users.UserID
-- May need to add CreatedByOrgUser to reference OrgUsers.OrgUserID
-- Or create a mapping/junction approach

-- Option 1: Add separate field
ALTER TABLE "Questions" 
ADD COLUMN IF NOT EXISTS "CreatedByOrgUser" uuid REFERENCES "OrgUsers"("OrgUserID") ON DELETE SET NULL;

-- Option 2: Keep current structure and handle in application logic
```

### 3. Subscriptions Table Enhancement
```sql
-- Add DisableReason field (optional)
ALTER TABLE "Subscriptions" 
ADD COLUMN IF NOT EXISTS "DisableReason" text;

-- Add DisabledBy field (optional)
ALTER TABLE "Subscriptions" 
ADD COLUMN IF NOT EXISTS "DisabledBy" uuid REFERENCES "Users"("UserID");

-- Add DisabledAt field (optional)
ALTER TABLE "Subscriptions" 
ADD COLUMN IF NOT EXISTS "DisabledAt" timestamptz;
```

### 4. TestQuestions Enhancement (if needed)
```sql
-- Add Source field to track question source (Organization vs Platform)
ALTER TABLE "TestQuestions" 
ADD COLUMN IF NOT EXISTS "QuestionSource" text; -- 'Organization' or 'Platform'
```

### 5. Question Revision History (Optional)
```sql
-- Create table to track question revision history
CREATE TABLE IF NOT EXISTS "QuestionRevisions" (
  "RevisionID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "QuestionID" uuid REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "RevisedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "RevisionReason" text,
  "PreviousData" jsonb,
  "RevisedAt" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_questionrevisions_questionid" ON "QuestionRevisions"("QuestionID");
```

---

## API Endpoints Required

### Question Management APIs

#### Subject Expert APIs
- `GET /api/org/questions/available-exams` - List exams available for question creation (based on subscription)
- `POST /api/org/questions` - Create new question
- `GET /api/org/questions` - List questions created by Subject Expert
- `GET /api/org/questions/rejected` - List rejected questions
- `PUT /api/org/questions/:questionId` - Update/re-submit rejected question
- `GET /api/org/questions/:questionId` - Get question details

#### Reviewer APIs
- `GET /api/org/questions/pending-review` - List questions pending review
- `GET /api/org/questions/:questionId` - Get question details for review
- `POST /api/org/questions/:questionId/approve` - Approve question
- `POST /api/org/questions/:questionId/reject` - Reject question with comments

### Test Question Binding APIs

#### OrgAdmin APIs
- `GET /api/org/tests/:testId/questions/available` - Get available questions for test (organization + platform-wide)
- `GET /api/org/tests/:testId/questions/organization` - Get organization's verified questions
- `GET /api/org/tests/:testId/questions/platform` - Get platform-wide verified questions
- `POST /api/org/tests/:testId/questions/bind` - Bind questions to test (manual selection)
- `POST /api/org/tests/:testId/questions/auto-bind` - Auto-bind questions based on criteria
- `GET /api/org/tests/:testId/questions` - Get questions bound to test

### Subscription Management APIs

#### SuperAdmin APIs
- `PUT /api/admin/subscriptions/:subscriptionId/status` - Toggle subscription status (enable/disable)
- `GET /api/admin/subscriptions` - List all subscriptions with filters

### Student Authentication APIs

#### Student APIs
- `POST /api/student/auth/login` - Student login
- `POST /api/student/auth/logout` - Student logout
- `GET /api/student/auth/me` - Get current student info

### Student Dashboard APIs

#### Student APIs
- `GET /api/student/dashboard/stats` - Get dashboard statistics
- `GET /api/student/assignments` - Get test assignments
- `GET /api/student/assignments/:assignmentId` - Get assignment details
- `GET /api/student/attempts` - Get test attempts
- `GET /api/student/attempts/:attemptId` - Get attempt details with results
- `GET /api/student/analytics/performance` - Get performance analytics
- `GET /api/student/analytics/subject-wise` - Get subject-wise analytics
- `GET /api/student/analytics/topic-wise` - Get topic-wise analytics
- `GET /api/student/analytics/trends` - Get performance trends over time

### Student Notification APIs

#### Student APIs
- `GET /api/student/notifications` - Get student notifications
- `GET /api/student/notifications/unread-count` - Get unread count
- `PUT /api/student/notifications/:notificationId/read` - Mark as read
- `PUT /api/student/notifications/mark-all-read` - Mark all as read
- `DELETE /api/student/notifications/:notificationId` - Delete notification

---

## UI/UX Considerations

### Question Management UI

#### Subject Expert Interface
- **Question Creation Form**
  - Exam selection dropdown (filtered by subscription)
  - Subject selection (cascading from exam)
  - Topic selection (cascading from subject)
  - Question text editor (rich text support)
  - Options input (dynamic add/remove)
  - Correct answer selection (radio/checkbox based on question type)
  - Difficulty level selector
  - Explanation text area
  - Preview mode
  - Save as draft / Submit for review

- **My Questions Page**
  - List of created questions
  - Filter by: Exam, Subject, Topic, Status (Pending, Approved, Rejected)
  - Status badges
  - Quick actions: Edit, View, Delete

- **Rejected Questions Page**
  - List of rejected questions
  - Reviewer comments display
  - Edit and resubmit functionality

#### Reviewer Interface
- **Review Queue Page**
  - List of pending questions
  - Filter and search
  - Question preview card
  - Quick approve/reject actions
  - Detailed review modal

- **Review Modal**
  - Full question display
  - Options with correct answer highlighted
  - Explanation
  - Reviewer comments text area
  - Approve/Reject buttons
  - Previous review history (if applicable)

### Test Question Binding UI

#### OrgAdmin Interface
- **Question Selection Modal**
  - Toggle between Manual and Auto modes
  - Manual mode:
    - Filter panel (Exam, Subject, Topic, Difficulty, Type)
    - Question list with checkboxes
    - Question preview
    - Selected count display
    - Add to test button
  - Auto mode:
    - Criteria configuration form
    - Subject distribution sliders/inputs
    - Difficulty distribution
    - Preview selected questions
    - Apply button

### Student Dashboard UI

#### Student Interface
- **Dashboard Layout**
  - Header with student name and organization
  - Statistics cards (Total tests, Completed, Pending, Average score)
  - Upcoming tests section
  - Recent activity section
  - Performance summary chart

- **Test Assignments Page**
  - List view with filters
  - Status badges
  - Action buttons (Start Test, View Details)
  - Search functionality

- **Analytics Page**
  - Performance charts (line, bar, pie)
  - Subject-wise breakdown
  - Topic-wise breakdown
  - Time-based trends
  - Export options

- **Test Results Page**
  - Detailed result view
  - Question-wise review
  - Correct/incorrect indicators
  - Explanation display
  - Download PDF option

### Notification UI

#### Student Notification Bell
- Similar to existing notification bell
- Student-specific styling
- Notification types with icons
- Click to view details
- Mark as read functionality

---

## Testing Considerations

### Unit Tests
- Question creation validation
- Subscription validation
- Question review workflow
- Auto-selection algorithm
- Student authentication

### Integration Tests
- Question creation → Review → Approval workflow
- Test question binding (manual and auto)
- Student login → Dashboard → Test attempt flow
- Notification creation and delivery

### E2E Tests
- Complete question lifecycle (create → review → approve → use in test)
- Student test taking flow
- Notification delivery and interaction

---

## Security Considerations

1. **Access Control**
   - Subject Experts can only create questions for subscribed exams
   - Reviewers can only review questions from their organization
   - Students can only access their own data
   - SuperAdmin has full access

2. **Data Isolation**
   - Organization-specific questions are isolated
   - Students can only see their organization's data
   - Platform-wide questions are read-only for organizations

3. **Input Validation**
   - Validate all question inputs
   - Sanitize question text and options
   - Validate subscription status before allowing actions

4. **Audit Logging**
   - Log all question creation, review, and approval actions
   - Log subscription status changes
   - Log student login attempts

---

## Future Enhancements (Out of Scope)

1. **Question Versioning**: Full version history for questions
2. **Collaborative Review**: Multiple reviewers for questions
3. **Question Templates**: Reusable question templates
4. **AI Question Generation**: Integration with AI for question creation
5. **Question Bank Marketplace**: Organizations can share/sell questions
6. **Advanced Analytics**: Predictive analytics, recommendations
7. **Mobile App**: Native mobile application for students
8. **Offline Mode**: Offline test taking capability

---

## Notes

- This document serves as a planning and specification document
- Implementation details may evolve during development
- Database schema changes should be tested in development environment first
- API endpoints should follow RESTful conventions
- UI/UX should follow HCI principles and be responsive
- All features should include proper error handling and user feedback

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]  
**Status**: Planning Phase
