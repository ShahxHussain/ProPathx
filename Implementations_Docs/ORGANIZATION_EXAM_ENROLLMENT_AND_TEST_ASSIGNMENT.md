# Organization Exam Enrollment and Test Assignment System

## Table of Contents
1. [Overview](#overview)
2. [Exam Structure](#exam-structure)
3. [Organization Enrollment in Exams](#organization-enrollment-in-exams)
4. [Subscription-Based Model](#subscription-based-model)
5. [Test Creation Process](#test-creation-process)
6. [Test Assignment Mechanisms](#test-assignment-mechanisms)
7. [System Flow Diagrams](#system-flow-diagrams)
8. [Database Schema Reference](#database-schema-reference)
9. [API Endpoints Reference](#api-endpoints-reference)
10. [Implementation Status](#implementation-status)

---

## Overview

This document explains how organizations (via OrgAdmin) can enroll their organization in available exams on the platform and create tests for their students. The system supports three types of test assignments:
- **Single User**: Assign a test to a specific student
- **Group of Users**: Assign a test to a student group
- **All Users**: Assign a test to all students in the organization

---

## Exam Structure

### Hierarchical Structure

The exam structure follows a three-level hierarchy:

```
Exam
  ├── Subjects (e.g., Mathematics, Physics, Chemistry)
  │   └── Topics (e.g., Algebra, Calculus, Geometry)
  └── Questions (linked to Topics)
```

### Exam Types

1. **Platform-Wide Exams** (`OrgID = NULL`)
   - Created by SuperAdmin
   - Available to all organizations
   - Examples: MDCAT, ECAT, IELTS (standardized exams)
   - Can be used by any organization to create tests

2. **Organization-Specific Exams** (`OrgID = <Organization UUID>`)
   - Created by SuperAdmin and assigned to a specific organization
   - Only visible and usable by that organization
   - Examples: Custom internal exams, organization-specific certifications

### Database Schema

**Exams Table:**
- `ExamID` (Primary Key)
- `ExamName` (e.g., "MDCAT", "ECAT")
- `Description`
- `Syllabus`
- `NoOfSubjects` (expected number of subjects)
- `OrgID` (Foreign Key to Organizations, nullable)
- `CreatedBy` (Foreign Key to Users - SuperAdmin)
- `CreatedAt`

**Subjects Table:**
- `SubjectID` (Primary Key)
- `ExamID` (Foreign Key to Exams)
- `SubjectName`
- `Description`
- `Weightage` (percentage weight in exam)
- `CreatedBy`
- `CreatedAt`

**Topics Table:**
- `TopicID` (Primary Key)
- `SubjectID` (Foreign Key to Subjects)
- `TopicName`
- `Description`
- `CreatedBy`
- `CreatedAt`

---

## Organization Enrollment in Exams

### Current Implementation

Organizations enroll in exams through **Subscription Plans**. The system uses a **subscription-based enrollment model**:

1. **Subscription Plan Structure**
   - SuperAdmin creates `SubscriptionPlans` with pricing and features
   - Each plan can be linked to specific exams via `SubscriptionPlanExams` table
   - Plans define limits per exam:
     - `MaxStudents`: Maximum students that can be enrolled
     - `MaxTests`: Maximum tests that can be created
     - `MaxQuestionsPerTest`: Maximum questions per test
     - `MaxTestsPerDay`: Daily test creation limit
     - `AISupport`: Whether AI question generation is enabled
     - `IsMandatory`: Whether the exam is mandatory in the plan

2. **Organization Subscription**
   - Organizations subscribe to a plan via `Subscriptions` table
   - Subscription links: `EntityType='Organization'`, `EntityID=<OrgID>`, `PlanID`
   - Subscription has: `StartDate`, `EndDate`, `ActivatedAt`, `AutoRenew`, `Status`
   - Status can be: 'Active', 'Expired', 'Cancelled'

3. **Exam Exploration**
   - OrgAdmin can browse all available exams via "Explore Exams" feature
   - This includes:
     - All platform-wide exams (`OrgID = NULL`)
     - Organization-specific exams assigned to their organization (`OrgID = <Their OrgID>`)
   - API Endpoint: `GET /api/org/auth/exams/explore`

4. **Exam Availability for Test Creation**
   - Organizations can only create tests for exams included in their active subscription plan
   - The exam must be linked to their subscription plan via `SubscriptionPlanExams`
   - Organization must have an active subscription (`Status = 'Active'`)
   - Usage limits are tracked per exam via `UsageCounters` table

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│              Subscription-Based Exam Enrollment Flow          │
└─────────────────────────────────────────────────────────────┘

1. SuperAdmin creates Exam
   ├── Option A: Platform-wide (OrgID = NULL)
   │   └── Can be added to subscription plans
   │
   └── Option B: Organization-specific (OrgID = <OrgID>)
       └── Can be added to subscription plans

2. SuperAdmin creates SubscriptionPlan
   └── Defines pricing, duration, and features

3. SuperAdmin links Exams to SubscriptionPlan
   └── Creates SubscriptionPlanExams records
       ├── Sets limits (MaxStudents, MaxTests, etc.)
       ├── Configures AISupport
       └── Marks IsMandatory if required

4. Organization subscribes to a Plan
   └── Creates Subscription record
       ├── EntityType = 'Organization'
       ├── EntityID = <OrgID>
       ├── PlanID = <Selected Plan>
       └── Status = 'Active'

5. OrgAdmin explores available exams
   └── Sees: All exams (platform-wide + org-specific)
       └── Can see which exams are in their subscription plan

6. OrgAdmin creates Test
   └── Must have active subscription
       └── Exam must be in subscription plan
           └── Usage limits are checked via UsageCounters
```

### Subscription-Based Enrollment Model

The current implementation uses a **subscription-based enrollment model**:

1. **Plan-Based Access**
   - Organizations subscribe to plans that include specific exams
   - Each plan-exam combination has configurable limits
   - Access is controlled through active subscriptions

2. **Usage Tracking**
   - `UsageCounters` tracks usage per subscription, exam, and month
   - Fields tracked:
     - `StudentsEnrolled`: Number of students enrolled
     - `TestsCreated`: Total tests created
     - `TestsCreatedToday`: Daily test creation count (resets daily)
     - `QuestionsCreated`: Total questions created
     - `AIQuestionsGenerated`: AI-generated questions count
     - `StudentAttempts`: Number of test attempts
   - `LastResetAt`: Tracks when daily counters were last reset
   - `MonthKey`: CHAR(7) format (e.g., "2024-01") for monthly tracking

3. **Enforcement**
   - System checks limits before allowing test creation
   - Daily limits reset based on `LastResetAt` timestamp
   - Monthly limits reset when `MonthKey` changes
   - Access denied if subscription is expired or cancelled

---

## Subscription-Based Model

### Overview

The system now uses a **subscription-based model** where organizations must have active subscriptions to create tests. This provides:

1. **Controlled Access**: Organizations can only create tests for exams included in their subscription plan
2. **Usage Limits**: Per-exam limits prevent overuse and ensure fair resource allocation
3. **Flexible Pricing**: Different plans can offer different exams with varying limits
4. **Usage Tracking**: Comprehensive tracking of usage per exam, per month

### Subscription Plan Structure

**SubscriptionPlans Table:**
- `PlanID` (Primary Key)
- `PlanName` (e.g., "Basic", "Institutional", "Enterprise")
- `Price` (Numeric)
- `DurationMonths` (Integer)
- `Features` (JSONB) - Additional plan features

**SubscriptionPlanExams Table:**
Links exams to subscription plans with per-exam configuration:
- `PlanID` + `ExamID` (Composite Primary Key)
- `IsMandatory` - Whether exam is required in the plan
- `MaxStudents` - Maximum students that can be enrolled for this exam
- `MaxTests` - Maximum tests that can be created for this exam
- `MaxQuestionsPerTest` - Maximum questions allowed per test
- `MaxTestsPerDay` - Daily limit for test creation
- `AISupport` - Whether AI question generation is enabled
- `ExtraConfig` - Additional JSON configuration

### Subscription Lifecycle

1. **Organization Subscribes**
   - Creates `Subscription` record
   - `EntityType = 'Organization'`, `EntityID = <OrgID>`
   - Links to `PlanID`
   - Sets `StartDate`, `EndDate`
   - `Status = 'Active'` (after activation)

2. **Subscription Activation**
   - `ActivatedAt` timestamp is set
   - `UsageCounters` records initialized for each exam in plan
   - Organization gains access to exams in the plan

3. **Usage Tracking**
   - `UsageCounters` tracks usage per subscription, per exam, per month
   - Monthly tracking via `MonthKey` (format: "YYYY-MM")
   - Daily counters reset based on `LastResetAt`

4. **Subscription Renewal**
   - If `AutoRenew = TRUE`, subscription auto-extends
   - Otherwise, manual renewal required
   - `Status` changes to 'Expired' when `EndDate` passes

### Usage Limits Enforcement

Before creating a test, the system checks:

1. **Subscription Status**
   - Subscription must be 'Active'
   - Current date must be between `StartDate` and `EndDate`

2. **Exam Access**
   - Exam must exist in `SubscriptionPlanExams` for the plan
   - Organization's subscription must link to that plan

3. **Usage Limits** (from `UsageCounters` and `SubscriptionPlanExams`)
   - `TestsCreated` < `MaxTests`
   - `TestsCreatedToday` < `MaxTestsPerDay`
   - `TotalQuestions` <= `MaxQuestionsPerTest`
   - `StudentsEnrolled` < `MaxStudents` (if applicable)

4. **Daily Reset Logic**
   - If `LastResetAt` is NULL or more than 24 hours ago:
     - `TestsCreatedToday` resets to 0
     - `LastResetAt` updated to current timestamp

---

## Test Creation Process

### Test Types

Tests can be created with three types:

1. **Practice Test** (`TestType = 'Practice'`)
   - For self-assessment and practice
   - Can be attempted multiple times
   - Immediate feedback

2. **Mock Test** (`TestType = 'Mock'`)
   - Simulates actual exam conditions
   - Limited attempts
   - Scheduled timing

3. **Final Test** (`TestType = 'Final'`)
   - Official assessment
   - Single attempt
   - Strict timing and monitoring

### Test Creation Steps

#### Step 1: Verify Subscription
- System checks if organization has active subscription
- Verifies subscription status is 'Active'
- Checks if subscription end date hasn't passed

#### Step 2: Select Exam
- OrgAdmin navigates to "Tests" section
- Clicks "Create New Test"
- Selects an exam from available exams
- **System validates**: Exam must be included in subscription plan via `SubscriptionPlanExams`
- **System checks**: Usage limits haven't been exceeded

#### Step 2: Configure Test Details
- **Test Name**: Custom name for the test
- **Test Type**: Practice / Mock / Final
- **Duration**: Total time in minutes
- **Test Date**: Scheduled date
- **Start Time**: When test becomes available
- **End Time**: When test closes
- **Total Questions**: Number of questions in test
- **Total Marks**: Maximum marks

#### Step 3: Select Questions
- Choose questions from question bank
- Filter by:
  - Subject
  - Topic
  - Difficulty Level (Easy, Medium, Hard)
  - Question Type (Single Correct, Multiple Correct)
- Can use:
  - Organization's question bank (questions with `OrgID = <OrgID>`)
  - Platform-wide verified questions (if allowed)
  - AI-generated questions (if subscription includes)

#### Step 4: Configure Question Settings
- Assign marks per question
- Set negative marking (if applicable)
- Set time limit per question (optional)

#### Step 5: Save Test
- Test is created with status "Active" or "Inactive"
- Test is linked to:
  - **Subscription** (`SubscriptionID` - Required)
  - Organization (`OrgID`)
  - Exam (`ExamID`)
  - Creator (`CreatedBy` - OrgAdmin's OrgUserID or UserID)
- **UsageCounters updated**:
  - `TestsCreated` incremented
  - `TestsCreatedToday` incremented
  - `LastResetAt` updated if needed (for daily reset)

### Database Schema

**Tests Table:**
- `TestID` (Primary Key)
- `SubscriptionID` (Foreign Key to Subscriptions) - **REQUIRED**
- `ExamID` (Foreign Key to Exams)
- `CreatedBy` (Foreign Key to Users.UserID) - Note: Currently references Users table, but typically set by OrgAdmin (OrgUser). May need to track OrgUserID separately or use a mapping.
- `OrgID` (Foreign Key to Organizations, nullable)
- `TestName`
- `TestType` (ENUM: 'Practice', 'Mock', 'Final')
- `DurationMinutes`
- `TotalQuestions`
- `TotalMarks`
- `TestDate`
- `StartTime`
- `EndTime`
- `CreatedAt`
- `Status` (ENUM: 'Active', 'Inactive')

**SubscriptionPlanExams Table:**
- `PlanID` (Foreign Key to SubscriptionPlans)
- `ExamID` (Foreign Key to Exams)
- `IsMandatory` (BOOLEAN) - Whether exam is required in plan
- `MaxStudents` (INTEGER, nullable) - Max students that can be enrolled
- `MaxTests` (INTEGER, nullable) - Max tests that can be created
- `MaxQuestionsPerTest` (INTEGER, nullable) - Max questions per test
- `MaxTestsPerDay` (INTEGER, nullable) - Daily test creation limit
- `AISupport` (BOOLEAN, nullable) - Whether AI question generation is enabled
- `ExtraConfig` (JSONB, nullable) - Additional configuration
- Primary Key: (`PlanID`, `ExamID`)

**Subscriptions Table:**
- `SubscriptionID` (Primary Key)
- `EntityType` (ENUM: 'Student', 'Organization')
- `EntityID` (UUID) - Organization ID or Student ID
- `PlanID` (Foreign Key to SubscriptionPlans)
- `StartDate` (DATE)
- `EndDate` (DATE)
- `ActivatedAt` (TIMESTAMP, nullable) - When subscription was activated
- `AutoRenew` (BOOLEAN, default FALSE) - Whether to auto-renew
- `Status` (TEXT) - 'Active', 'Expired', 'Cancelled'
- `CreatedAt` (TIMESTAMP)

**UsageCounters Table:**
- `UsageID` (Primary Key)
- `SubscriptionID` (Foreign Key to Subscriptions)
- `ExamID` (Foreign Key to Exams) - **REQUIRED**
- `MonthKey` (CHAR(7)) - Format: "YYYY-MM" (e.g., "2024-01")
- `StudentsEnrolled` (INTEGER, default 0)
- `TestsCreated` (INTEGER, default 0) - Total tests created
- `TestsCreatedToday` (INTEGER, default 0) - Daily counter (resets)
- `QuestionsCreated` (INTEGER, default 0)
- `AIQuestionsGenerated` (INTEGER, default 0)
- `StudentAttempts` (INTEGER, default 0)
- `LastResetAt` (TIMESTAMP, nullable) - When daily counters were last reset
- `UpdatedAt` (TIMESTAMP)
- Unique Constraint: (`SubscriptionID`, `ExamID`, `MonthKey`)

**TestQuestions Table:**
- `TestID` (Foreign Key to Tests)
- `QuestionID` (Foreign Key to Questions)
- `Marks` (marks for this question in this test)
- `TimeLimit` (optional time limit per question)
- `NegativeMarks` (penalty for wrong answer)
- Primary Key: (`TestID`, `QuestionID`)

---

## Test Assignment Mechanisms

### Assignment Types

#### 1. Single User Assignment

**Use Case**: Assign a test to a specific student (e.g., make-up test, remedial test)

**Process:**
1. OrgAdmin navigates to test management
2. Selects a test
3. Clicks "Assign Test"
4. Selects "Single User" option
5. Chooses a student from organization's student list
6. System creates assignment record

**Database Implementation:**
- Could use a `TestAssignments` table (to be implemented):
  ```
  TestAssignments:
    - AssignmentID (PK)
    - TestID (FK)
    - StudentID (FK)
    - AssignedBy (FK to OrgUsers)
    - AssignedAt
    - Status (Pending, Completed, Expired)
  ```

**Alternative Approach (Current Schema):**
- Use `StudentAttempts` table when student starts the test
- Test visibility is controlled by:
  - Test's `OrgID` matching student's `OrgID`
  - Test's `StartTime` and `EndTime`
  - Test's `Status = 'Active'`

#### 2. Group of Users Assignment

**Use Case**: Assign test to a specific student group (e.g., "Batch 2024", "Section A")

**Prerequisites:**
- Student groups must be created first
- Students must be assigned to groups

**Process:**
1. OrgAdmin creates/selects a student group
2. Selects a test
3. Clicks "Assign Test"
4. Selects "Group Assignment" option
5. Chooses a group from available groups
6. System assigns test to all students in that group

**Database Schema:**

**StudentGroups Table:**
- `GroupID` (Primary Key)
- `OrgID` (Foreign Key to Organizations)
- `GroupName` (e.g., "Batch 2024", "Section A")
- `Description`
- `CreatedBy` (Foreign Key to OrgUsers)
- `CreatedAt`
- `Status` (ENUM: 'Active', 'Inactive')

**StudentGroupMembers Table:**
- `GroupID` (Foreign Key to StudentGroups)
- `StudentID` (Foreign Key to Students)
- `JoinedAt`
- Primary Key: (`GroupID`, `StudentID`)

**Assignment Implementation:**
```
1. Query all StudentIDs from StudentGroupMembers where GroupID = <selected>
2. For each StudentID:
   - Create TestAssignment record (or mark test as available)
   - Send notification to student
```

#### 3. All Users Assignment

**Use Case**: Assign test to all students in the organization (e.g., organization-wide assessment)

**Process:**
1. OrgAdmin selects a test
2. Clicks "Assign Test"
3. Selects "All Users" option
4. System assigns test to all active students in the organization

**Implementation:**
```
1. Query all Students where OrgID = <OrgID> AND Status = 'Active'
2. For each Student:
   - Create TestAssignment record (or mark test as available)
   - Send notification to student
```

### Assignment Notification System

When a test is assigned, notifications are sent:

**Notification Details:**
- **EntityType**: 'Student'
- **EntityID**: Student's StudentID
- **Title**: "New Test Assigned: [TestName]"
- **Message**: "A new [TestType] test '[TestName]' has been assigned to you. Test Date: [TestDate]"
- **NotificationType**: 'Exam'
- **CreatedAt**: Current timestamp

**Notification Flow:**
```
Test Assignment
    ↓
For each assigned student:
    ↓
Create Notification record
    ↓
Student sees notification in dashboard
    ↓
Student can click to view test details
```

---

## System Flow Diagrams

### Complete Flow: Subscription to Test Assignment

```
┌─────────────────────────────────────────────────────────────────┐
│              Complete System Flow (Subscription-Based)            │
└─────────────────────────────────────────────────────────────────┘

[SuperAdmin]
    │
    ├─→ Creates Exam (Platform-wide or Org-specific)
    │       │
    │       ├─→ Creates Subjects
    │       │       │
    │       │       └─→ Creates Topics
    │       │
    │       └─→ Exam available in system
    │
    ├─→ Creates SubscriptionPlan
    │       └─→ Defines pricing, duration, features
    │
    └─→ Links Exams to SubscriptionPlan
            └─→ Creates SubscriptionPlanExams
                ├─→ Sets limits (MaxStudents, MaxTests, etc.)
                ├─→ Configures AISupport
                └─→ Marks IsMandatory if required

[Organization]
    │
    ├─→ Subscribes to SubscriptionPlan
    │       └─→ Creates Subscription record
    │           ├─→ EntityType = 'Organization'
    │           ├─→ EntityID = <OrgID>
    │           ├─→ PlanID = <Selected Plan>
    │           └─→ Status = 'Active'
    │
    └─→ UsageCounters initialized
            └─→ Per exam, per month tracking

[OrgAdmin]
    │
    ├─→ Explores Available Exams
    │       │
    │       └─→ Sees: All exams (with subscription status)
    │
    ├─→ Selects Exam (must be in subscription plan)
    │
    ├─→ System Validates
    │       ├─→ Checks subscription is active
    │       ├─→ Verifies exam is in plan
    │       ├─→ Checks usage limits (TestsCreated, TestsCreatedToday)
    │       └─→ Validates daily/monthly limits
    │
    ├─→ Creates Test
    │       │
    │       ├─→ Configures test details
    │       │       ├─→ Test Name, Type, Duration
    │       │       ├─→ Test Date, Start/End Time
    │       │       ├─→ Total Questions (validated against MaxQuestionsPerTest)
    │       │       └─→ Total Marks
    │       │
    │       ├─→ Selects Questions
    │       │       ├─→ Filters by Subject/Topic
    │       │       ├─→ Filters by Difficulty
    │       │       ├─→ Uses AI if AISupport enabled
    │       │       └─→ Selects from question bank
    │       │
    │       └─→ Saves Test
    │           ├─→ Links to SubscriptionID
    │           └─→ Updates UsageCounters
    │               ├─→ TestsCreated++
    │               ├─→ TestsCreatedToday++
    │               └─→ LastResetAt updated if needed
    │
    ├─→ Assigns Test
    │       │
    │       ├─→ Option 1: Single User
    │       │       └─→ Selects specific student
    │       │
    │       ├─→ Option 2: Group of Users
    │       │       └─→ Selects student group
    │       │
    │       └─→ Option 3: All Users
    │               └─→ Assigns to all org students
    │
    └─→ System sends notifications to assigned students

[Student]
    │
    ├─→ Receives notification
    │
    ├─→ Views assigned tests in dashboard
    │
    └─→ Attempts test when available
        └─→ UsageCounters.StudentAttempts++
```

### Test Assignment Decision Tree

```
                    ┌─────────────────┐
                    │  Assign Test?    │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
         ┌───────▼──────┐    │    ┌───────▼──────┐
         │ Single User │    │    │  All Users    │
         └───────┬──────┘    │    └───────┬──────┘
                 │           │            │
                 │    ┌──────▼──────┐    │
                 │    │   Group     │    │
                 │    │  of Users   │    │
                 │    └──────┬──────┘    │
                 │           │           │
                 └───────────┼───────────┘
                             │
                    ┌────────▼────────┐
                    │  Execute        │
                    │  Assignment     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Send            │
                    │  Notifications   │
                    └─────────────────┘
```

---

## Database Schema Reference

### Key Tables for Test Assignment

#### Tests Table
```sql
CREATE TABLE "Tests" (
  "TestID" uuid PRIMARY KEY,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "ExamID" uuid REFERENCES "Exams"("ExamID"),
  "TestName" text,
  "TestType" test_type_enum, -- 'Practice','Mock','Final'
  "DurationMinutes" int,
  "TotalQuestions" int,
  "TotalMarks" numeric,
  "TestDate" date,
  "StartTime" timestamptz,
  "EndTime" timestamptz,
  "CreatedAt" timestamptz DEFAULT now(),
  "Status" status_organizations_enum -- 'Active','Inactive'
);
```

#### Students Table
```sql
CREATE TABLE "Students" (
  "StudentID" uuid PRIMARY KEY,
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "FullName" text,
  "Email" text UNIQUE,
  "Status" status_users_enum, -- 'Active','Inactive','Suspended'
  -- ... other fields
);
```

#### StudentGroups Table
```sql
CREATE TABLE "StudentGroups" (
  "GroupID" uuid PRIMARY KEY,
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "GroupName" text,
  "Description" text,
  "CreatedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "CreatedAt" timestamptz DEFAULT now(),
  "Status" status_organizations_enum
);
```

#### StudentGroupMembers Table
```sql
CREATE TABLE "StudentGroupMembers" (
  "GroupID" uuid REFERENCES "StudentGroups"("GroupID"),
  "StudentID" uuid REFERENCES "Students"("StudentID"),
  "JoinedAt" timestamptz DEFAULT now(),
  PRIMARY KEY ("GroupID", "StudentID")
);
```

#### StudentAttempts Table (for tracking test attempts)
```sql
CREATE TABLE "StudentAttempts" (
  "AttemptID" uuid PRIMARY KEY,
  "StudentID" uuid REFERENCES "Students"("StudentID"),
  "TestID" uuid REFERENCES "Tests"("TestID"),
  "StartTime" timestamptz,
  "EndTime" timestamptz,
  "ObtainedMarks" numeric,
  "Grade" text,
  "Percentile" numeric
);
```

### Recommended: TestAssignments Table (To Be Implemented)

For explicit test assignment tracking, consider adding:

```sql
CREATE TABLE "TestAssignments" (
  "AssignmentID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "TestID" uuid REFERENCES "Tests"("TestID") ON DELETE CASCADE,
  "StudentID" uuid REFERENCES "Students"("StudentID") ON DELETE CASCADE,
  "GroupID" uuid REFERENCES "StudentGroups"("GroupID") ON DELETE SET NULL,
  "AssignmentType" text, -- 'Single', 'Group', 'All'
  "AssignedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "AssignedAt" timestamptz DEFAULT now(),
  "Status" text, -- 'Pending', 'InProgress', 'Completed', 'Expired'
  "DueDate" timestamptz,
  UNIQUE("TestID", "StudentID")
);

CREATE INDEX "idx_testassignments_testid" ON "TestAssignments"("TestID");
CREATE INDEX "idx_testassignments_studentid" ON "TestAssignments"("StudentID");
CREATE INDEX "idx_testassignments_groupid" ON "TestAssignments"("GroupID");
```

**Benefits of TestAssignments Table:**
- Explicit tracking of which students are assigned which tests
- Ability to track assignment status
- Support for due dates
- Better analytics on test assignment patterns
- Clear audit trail of assignments

---

## API Endpoints Reference

### Current Endpoints

#### Exam Exploration
```
GET /api/org/auth/exams/explore
```
- Returns all exams available to the organization
- Includes platform-wide exams and organization-specific exams
- Response includes exam details, subject count, organization name

#### Test Management ✅ **IMPLEMENTED**
```
GET    /api/org/tests              # List all tests for organization (with pagination)
POST   /api/org/tests              # Create a new test (with subscription validation)
GET    /api/org/tests/:testId     # Get test details
```
**Note**: Update and Delete endpoints are not yet implemented.

#### Test Assignment (To Be Implemented)
```
POST   /api/org/tests/:testId/assign/single    # Assign to single user
POST   /api/org/tests/:testId/assign/group     # Assign to group
POST   /api/org/tests/:testId/assign/all       # Assign to all users
GET    /api/org/tests/:testId/assignments      # Get assignment list
DELETE /api/org/tests/:testId/assignments/:assignmentId  # Remove assignment
```

#### Student Registration ✅ **IMPLEMENTED**
```
POST   /api/org/students            # Register a single student
POST   /api/org/students/bulk       # Bulk register students from CSV
GET    /api/org/students            # List all students (with pagination and search)
GET    /api/org/students/:studentId # Get student details
```

#### Subscription Management ✅ **IMPLEMENTED**
```
POST   /api/org/auth/subscriptions  # Create a new subscription
GET    /api/org/auth/subscriptions  # Get all subscriptions for organization
```

#### Student Groups (To Be Implemented)
```
GET    /api/org/groups              # List all student groups
POST   /api/org/groups              # Create a new group
GET    /api/org/groups/:groupId     # Get group details
PUT    /api/org/groups/:groupId    # Update group
DELETE /api/org/groups/:groupId    # Delete group
POST   /api/org/groups/:groupId/members        # Add students to group
DELETE /api/org/groups/:groupId/members/:studentId  # Remove student from group
```

### Example API Request/Response

#### Create Test
```http
POST /api/org/tests
Authorization: Bearer <orgAdmin_token>
Content-Type: application/json

{
  "testName": "MDCAT Practice Test 1",
  "examId": "uuid-of-selected-exam",
  "subscriptionId": "uuid-of-active-subscription",
  "testType": "Practice",
  "durationMinutes": 120,
  "totalQuestions": 100,
  "totalMarks": 100,
  "testDate": "2024-02-15",
  "startTime": "2024-02-15T09:00:00Z",
  "endTime": "2024-02-15T11:00:00Z",
  "questionIds": ["uuid1", "uuid2", "uuid3", ...],
  "status": "Active"
}
```

**Validation Checks:**
- Subscription must be active
- Exam must be in subscription plan
- `totalQuestions` <= `MaxQuestionsPerTest` (from SubscriptionPlanExams)
- `TestsCreated` < `MaxTests` (from SubscriptionPlanExams)
- `TestsCreatedToday` < `MaxTestsPerDay` (from SubscriptionPlanExams)

**Response:**
```json
{
  "message": "Test created successfully",
  "test": {
    "testId": "uuid",
    "testName": "MDCAT Practice Test 1",
    "examId": "uuid",
    "subscriptionId": "uuid",
    "orgId": "uuid",
    "createdBy": "uuid",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "usageUpdated": {
    "testsCreated": 5,
    "testsCreatedToday": 2,
    "remainingTests": 95,
    "remainingToday": 8
  }
}
```

#### Assign Test to Group
```http
POST /api/org/tests/:testId/assign/group
Authorization: Bearer <orgAdmin_token>
Content-Type: application/json

{
  "groupId": "uuid-of-student-group"
}
```

**Response:**
```json
{
  "message": "Test assigned to group successfully",
  "assignments": [
    {
      "assignmentId": "uuid1",
      "testId": "uuid",
      "studentId": "uuid1",
      "groupId": "uuid",
      "status": "Pending"
    },
    {
      "assignmentId": "uuid2",
      "testId": "uuid",
      "studentId": "uuid2",
      "groupId": "uuid",
      "status": "Pending"
    }
    // ... more assignments
  ],
  "totalAssigned": 25,
  "notificationsSent": 25
}
```

---

## Implementation Status

### ✅ Implemented Features

1. **Exam Structure**
   - ✅ Exams table with OrgID support
   - ✅ Subjects and Topics hierarchy
   - ✅ Platform-wide and organization-specific exams
   - ✅ `NoOfSubjects` field for exam structure definition

2. **Subscription System**
   - ✅ SubscriptionPlans table
   - ✅ SubscriptionPlanExams table (linking exams to plans)
   - ✅ Subscriptions table with `ActivatedAt`, `AutoRenew`, `CreatedAt`
   - ✅ UsageCounters table with enhanced tracking:
     - Per-exam tracking via `ExamID`
     - Daily counters (`TestsCreatedToday`, `LastResetAt`)
     - Monthly tracking via `MonthKey` (CHAR(7))
     - Multiple usage metrics (StudentsEnrolled, TestsCreated, QuestionsCreated, AIQuestionsGenerated, StudentAttempts)
   - ✅ **Subscription Creation API**: `POST /api/org/auth/subscriptions`
   - ✅ **Subscription Listing API**: `GET /api/org/auth/subscriptions`
   - ✅ **Subscription UI**: Full subscription creation interface in `SubscriptionPlans.jsx`
   - ✅ **Usage Counter Initialization**: Automatically initialized when subscription is created

3. **Exam Exploration**
   - ✅ OrgAdmin can explore available exams
   - ✅ API endpoint: `GET /api/org/auth/exams/explore`
   - ✅ Frontend page: `ExploreExams.jsx`

4. **Database Schema**
   - ✅ Tests table with `SubscriptionID` field (REQUIRED)
   - ✅ StudentGroups table
   - ✅ StudentGroupMembers table
   - ✅ StudentAttempts table

5. **Test Management** ✅ **NEWLY IMPLEMENTED**
   - ✅ Backend API endpoints:
     - `POST /api/org/tests` - Create test with subscription validation
     - `GET /api/org/tests` - List all tests with pagination
     - `GET /api/org/tests/:testId` - Get test details
   - ✅ Subscription validation in test creation
   - ✅ Usage limit checks (MaxTests, MaxTestsPerDay, MaxQuestionsPerTest)
   - ✅ Daily counter reset mechanism
   - ✅ Frontend UI: Complete test creation form in `Tests.jsx`
   - ✅ Test listing with search and pagination
   - ✅ Subscription selection in test creation
   - ✅ Usage limit validation and error handling

6. **Student Registration** ✅ **NEWLY IMPLEMENTED**
   - ✅ Backend API endpoints:
     - `POST /api/org/students` - Register single student
     - `POST /api/org/students/bulk` - Bulk register students from CSV
     - `GET /api/org/students` - List all students with pagination and search
     - `GET /api/org/students/:studentId` - Get student details
   - ✅ Frontend UI: Complete student registration interface in `Students.jsx`
   - ✅ Single student registration form
   - ✅ Bulk registration with CSV upload
   - ✅ CSV template download
   - ✅ Student listing with search and pagination
   - ✅ Duplicate email validation
   - ✅ Comprehensive error handling

### 🚧 Partially Implemented

1. **Question Selection**
   - ✅ Question bank exists
   - ✅ Questions linked to Topics
   - ⚠️ Test question selection UI needs implementation (currently questions can be linked via API)
   - ⚠️ AI question generation (if AISupport enabled) needs implementation

2. **Usage Dashboard**
   - ✅ Usage tracking implemented
   - ⚠️ Usage dashboard UI showing limits and current usage needs implementation

3. **Subscription Renewal**
   - ✅ Auto-renewal flag support
   - ⚠️ Subscription renewal interface needs implementation
   - ⚠️ Auto-renewal mechanism needs implementation

### ❌ Not Yet Implemented

1. **Test Assignment**
   - ❌ TestAssignments table (recommended)
   - ❌ Assignment API endpoints
   - ❌ Assignment UI (single/group/all)
   - ❌ Assignment notification triggers

2. **Student Group Management**
   - ✅ Database schema exists
   - ❌ Group creation UI
   - ❌ Group member management UI
   - ❌ Group API endpoints

3. **Test Visibility Control**
   - ❌ Logic to show tests only to assigned students
   - ❌ Test availability based on StartTime/EndTime
   - ❌ Test status filtering

4. **Question Selection UI**
   - ❌ Interactive question selection interface in test creation
   - ❌ Question filtering by subject/topic/difficulty
   - ❌ AI question generation interface (if AISupport enabled)

---

## Recommended Implementation Steps

### Phase 0: Subscription System Foundation
1. Implement subscription management APIs
2. Build subscription plan selection UI
3. Implement subscription creation/activation
4. Create usage dashboard showing limits and current usage
5. Implement daily counter reset mechanism

### Phase 1: Subscription Validation & Test Creation
1. Implement subscription validation middleware
2. Implement exam access validation (SubscriptionPlanExams check)
3. Implement usage limit checks before test creation
4. Implement test creation API endpoints (with subscription validation)
5. Build test creation form UI (with subscription selection)
6. Add usage limit display and warnings in UI
7. Implement question selection interface
8. Add test validation logic

### Phase 2: Usage Tracking & Limits
1. Implement UsageCounters update logic on test creation
2. Implement daily counter reset (check LastResetAt)
3. Implement monthly counter tracking (MonthKey management)
4. Build usage analytics dashboard
5. Add usage limit exceeded error handling
6. Implement AI question generation (if AISupport enabled)

### Phase 3: Student Group Management
1. Implement student group CRUD APIs
2. Build group management UI
3. Implement group member assignment
4. Add group-based filtering

### Phase 4: Test Assignment
1. Create TestAssignments table
2. Implement assignment API endpoints
3. Build assignment UI (single/group/all)
4. Integrate notification system
5. Implement test visibility logic

### Phase 5: Testing & Refinement
1. Test all subscription scenarios
2. Test all assignment scenarios
3. Add comprehensive error handling
4. Implement assignment analytics
5. Add bulk operations support
6. Optimize performance for large organizations
7. Implement subscription renewal workflow

---

## Security Considerations

1. **Access Control**
   - OrgAdmin can only assign tests to students in their organization
   - Verify `OrgID` matches in all assignment operations
   - Prevent cross-organization test access

2. **Test Visibility**
   - Students can only see tests assigned to them
   - Filter tests by assignment records
   - Respect test StartTime/EndTime boundaries

3. **Data Validation**
   - Validate test dates are in the future
   - Ensure StartTime < EndTime
   - Verify question IDs belong to selected exam
   - Check student/group belongs to organization
   - **Validate subscription is active** before test creation
   - **Verify exam is in subscription plan** via SubscriptionPlanExams
   - **Check usage limits** haven't been exceeded:
     - `TestsCreated` < `MaxTests`
     - `TestsCreatedToday` < `MaxTestsPerDay`
     - `TotalQuestions` <= `MaxQuestionsPerTest`
   - **Validate SubscriptionID** is provided and belongs to organization

---

## Conclusion

The system supports a **subscription-based exam and test management model** where:

1. **Exams** are created by SuperAdmin (platform-wide or org-specific)
2. **Subscription Plans** are created by SuperAdmin with configurable features and limits
3. **Exams are linked to Plans** via `SubscriptionPlanExams` with per-exam limits
4. **Organizations subscribe** to plans to gain access to exams
5. **Tests** are created by OrgAdmin and **require an active subscription**
6. **Usage is tracked** per subscription, per exam, per month via `UsageCounters`
7. **Tests** can be assigned to:
   - Single students (for targeted assessments)
   - Student groups (for batch/class assessments)
   - All students (for organization-wide assessments)

### Key Changes from Previous Model:

- **Subscription-Based Access**: Tests now require `SubscriptionID` - organizations must have active subscriptions
- **Per-Exam Limits**: Each exam in a plan has individual limits (MaxStudents, MaxTests, MaxQuestionsPerTest, MaxTestsPerDay)
- **Enhanced Usage Tracking**: `UsageCounters` now tracks usage per exam with daily and monthly counters
- **AI Support Control**: Plans can enable/disable AI question generation per exam
- **Mandatory Exams**: Plans can mark exams as mandatory

The current implementation has the foundation in place (database schema, subscription system, exam exploration), but requires additional development for test creation, assignment, and student group management features.

---

## Appendix: Key Relationships

```
SubscriptionPlans (1) ──→ (Many) SubscriptionPlanExams
SubscriptionPlanExams (Many) ──→ (1) Exams

Organizations (1) ──→ (Many) Subscriptions (EntityType='Organization')
Subscriptions (1) ──→ (1) SubscriptionPlans

Subscriptions (1) ──→ (Many) Tests (via SubscriptionID)
Subscriptions (1) ──→ (Many) UsageCounters

Exams (1) ──→ (Many) SubscriptionPlanExams
Exams (1) ──→ (Many) UsageCounters (via ExamID)
Exams (1) ──→ (Many) Subjects
Exams (1) ──→ (Many) Tests (via ExamID)

Organizations (1) ──→ (Many) Exams (via OrgID, for org-specific exams)
Organizations (1) ──→ (Many) Tests (via OrgID)
Organizations (1) ──→ (Many) Students (via OrgID)
Organizations (1) ──→ (Many) StudentGroups (via OrgID)

Subjects (1) ──→ (Many) Topics
Topics (1) ──→ (Many) Questions

Tests (1) ──→ (Many) TestQuestions
TestQuestions (Many) ──→ (1) Questions

StudentGroups (1) ──→ (Many) StudentGroupMembers
StudentGroupMembers (Many) ──→ (1) Students

Tests (1) ──→ (Many) TestAssignments (to be implemented)
TestAssignments (Many) ──→ (1) Students
TestAssignments (Many) ──→ (1) StudentGroups (optional)

Students (1) ──→ (Many) StudentAttempts
Tests (1) ──→ (Many) StudentAttempts
StudentAttempts (1) ──→ (Many) UsageCounters (via StudentAttempts count)
```

---

*Document Version: 2.0*  
*Last Updated: 2024*  
*Status: Revised - Subscription-Based Model*  
*Changes: Updated to reflect subscription-based test creation model with SubscriptionPlanExams, enhanced UsageCounters, and subscription requirements*
