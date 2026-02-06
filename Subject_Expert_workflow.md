# Subject Expert Workflow Documentation

## Table of Contents
1. [Overview](#overview)
2. [Subject Expert Types](#subject-expert-types)
3. [Access Control & Permissions](#access-control--permissions)
4. [Question Creation Workflow](#question-creation-workflow)
5. [Subscription Validation](#subscription-validation)
6. [Question Ownership & Visibility](#question-ownership--visibility)
7. [Review Process](#review-process)
8. [Database Schema Considerations](#database-schema-considerations)
9. [API Endpoints](#api-endpoints)
10. [UI/UX Considerations](#uiux-considerations)
11. [Implementation Notes](#implementation-notes)

---

## Overview

The ProPath platform supports two distinct types of Subject Experts, each with different access levels and restrictions:

1. **Organization Subject Expert** - Organization-level users who create questions for their organization's use
2. **Platform Subject Expert** - Platform-level users (SaaS provider's own experts) who create questions for platform-wide use

This document outlines the complete workflow, access controls, and implementation details for both types of Subject Experts.

---

## Subject Expert Types

### 1. Organization Subject Expert

**Definition**: A user belonging to an organization (`OrgUsers` table) with role `'Subject Expert'`.

**Characteristics**:
- Stored in `OrgUsers` table
- Has `OrgID` (belongs to an organization)
- Role: `'Subject Expert'` (from `role_orgusers_enum`)
- **Subscription Required**: Must have active subscription to create questions
- **Question Scope**: Can only create questions for exams linked to their organization's active subscription
- **Question Ownership**: Questions belong to the organization (`Questions.OrgID = Subject Expert's OrgID`)

**Use Case**: Educational institutions hire Subject Experts to create custom questions for their students based on their subscribed exam plans.

### 2. Platform Subject Expert

**Definition**: A platform-level user (`Users` table) with role `'Subject Expert'`.

**Characteristics**:
- Stored in `Users` table
- No `OrgID` (platform-level user)
- Role: `'Subject Expert'` (from `role_users_enum`)
- **No Subscription Required**: Can create questions without any subscription restrictions
- **Question Scope**: Can create questions for any exam on the platform
- **Question Ownership**: Questions are platform-wide (`Questions.OrgID = NULL`)

**Use Case**: The SaaS provider (ProPath) employs Subject Experts to create high-quality, verified questions that can be used by all organizations subscribing to relevant exams.

---

## Access Control & Permissions

### Authentication & Authorization

#### Organization Subject Expert
- **Login**: Uses `OrgUsers` credentials
- **JWT Token**: Contains `OrgUserID`, `OrgID`, `Role: 'Subject Expert'`, `ActorType: 'OrgUser'`
- **Access Validation**: 
  - Must belong to an active organization (`Organizations.Status = 'Active'`)
  - User status must be active (`OrgUsers.Status = 'Active'`)

#### Platform Subject Expert
- **Login**: Uses `Users` credentials
- **JWT Token**: Contains `UserID`, `Role: 'Subject Expert'`, `ActorType: 'User'`
- **Access Validation**:
  - User status must be active (`Users.Status = 'Active'`)
  - No organization validation required

### Question Creation Permissions

#### Organization Subject Expert
- ✅ Can create questions **only if**:
  1. Organization has an active subscription (`Subscriptions.Status = 'Active'`)
  2. Subscription `EndDate` has not passed
  3. Exam is linked to the subscription plan (`SubscriptionPlanExams`)
- ❌ Cannot create questions if:
  - No active subscription exists
  - Subscription has expired
  - Exam is not included in subscription plan
  - Organization status is 'Inactive'

#### Platform Subject Expert
- ✅ Can create questions **without restrictions**:
  - No subscription validation required
  - Can create questions for any exam
  - Platform-level access (SaaS provider's own experts)
- ❌ Cannot create questions if:
  - User status is 'Inactive' or 'Suspended'
  - Exam does not exist

---

## Question Creation Workflow

### Common Workflow Steps (Both Types)

1. **Select Exam**
   - Subject Expert selects an exam from available exams
   - Exam availability differs by type (see below)

2. **Select Subject & Topic**
   - Select subject within the exam
   - Select topic within the subject
   - Validate subject/topic belong to selected exam

3. **Create Question**
   - Enter question text
   - Select question type (Single Correct / Multiple Correct)
   - Select difficulty level (Easy / Medium / Hard)
   - Add explanation
   - Add multiple options (minimum 2, typically 4-5)
   - Mark correct option(s)
   - Attach media (if applicable) - images, diagrams, charts

4. **Save Question**
   - Question is saved with `IsVerified = false`
   - Question enters review queue
   - Notification sent to reviewers (if applicable)

### Organization Subject Expert - Specific Workflow

#### Step 1: Subscription Validation
```
1. Check if organization has active subscription
   - Query: Subscriptions WHERE EntityType='Organization' AND EntityID=<OrgID> AND Status='Active' AND EndDate >= CURRENT_DATE
   
2. If no active subscription:
   - Display message: "Your organization needs an active subscription to create questions. Please contact your administrator."
   - Disable question creation UI
   - Show available subscription plans (read-only)

3. If active subscription exists:
   - Extract PlanID from subscription
   - Query available exams: SubscriptionPlanExams WHERE PlanID=<PlanID>
   - Display only exams linked to subscription plan
```

#### Step 2: Exam Selection
- **Available Exams**: Only exams linked to active subscription plan
- **Filter**: Exams from `SubscriptionPlanExams` table where `PlanID` matches subscription's `PlanID`
- **Display**: Show exam name, description, and subscription limits (if any)

#### Step 3: Question Creation
- **Question Data**:
  - `TopicID`: Selected topic
  - `QuestionText`: User input
  - `QuestionType`: Selected type
  - `DifficultyLevel`: Selected level
  - `Explanation`: User input
  - `CreatedBy`: References `Users.UserID` (may need mapping or separate field)
  - `CreatedByOrgUser`: References `OrgUsers.OrgUserID` (if separate field exists)
  - `OrgID`: Set to Subject Expert's `OrgID`
  - `Source`: `'Self'`
  - `IsVerified`: `false`
  - `CreatedAt`: Current timestamp

- **Options Data**:
  - Each option gets `OptionID` (UUID, auto-generated)
  - `QuestionID`: References created question
  - `OptionNumber`: Sequential (1, 2, 3, ...)
  - `OptionText`: User input
  - `IsCorrect`: Boolean (true for correct option(s))

- **Media Data** (if applicable):
  - `QuestionID`: References created question
  - `Context`: 'Question', 'Option', or 'Explanation'
  - `OptionID`: Set if context is 'Option'
  - `FilePath`: Uploaded file path
  - `MediaType`: 'Image', 'Diagram', or 'Chart'

### Platform Subject Expert - Specific Workflow

#### Step 1: No Subscription Validation
- No subscription check required
- Platform Subject Expert has unrestricted access

#### Step 2: Exam Selection
- **Available Exams**: All exams on the platform
- **Filter**: All exams from `Exams` table
- **Display**: Show all exams (platform-wide and organization-specific)

#### Step 3: Question Creation
- **Question Data**:
  - `TopicID`: Selected topic
  - `QuestionText`: User input
  - `QuestionType`: Selected type
  - `DifficultyLevel`: Selected level
  - `Explanation`: User input
  - `CreatedBy`: References `Users.UserID` (Platform Subject Expert's UserID)
  - `OrgID`: `NULL` (platform-wide question)
  - `Source`: `'Self'`
  - `IsVerified`: `false`
  - `CreatedAt`: Current timestamp

- **Options Data**: Same as Organization Subject Expert

- **Media Data**: Same as Organization Subject Expert

---

## Subscription Validation

### Organization Subject Expert Validation Logic

```javascript
async function validateSubscriptionForQuestionCreation(orgId) {
  // 1. Check for active subscription
  const { data: subscription } = await supabase
    .from('Subscriptions')
    .select('SubscriptionID, PlanID, Status, StartDate, EndDate')
    .eq('EntityType', 'Organization')
    .eq('EntityID', orgId)
    .eq('Status', 'Active')
    .gte('EndDate', new Date().toISOString().split('T')[0])
    .maybeSingle();

  if (!subscription) {
    return {
      valid: false,
      reason: 'No active subscription found',
      message: 'Your organization needs an active subscription to create questions.'
    };
  }

  // 2. Get exams linked to subscription plan
  const { data: planExams } = await supabase
    .from('SubscriptionPlanExams')
    .select('ExamID')
    .eq('PlanID', subscription.PlanID);

  if (!planExams || planExams.length === 0) {
    return {
      valid: false,
      reason: 'No exams linked to subscription plan',
      message: 'No exams are available in your subscription plan. Please contact support.'
    };
  }

  return {
    valid: true,
    subscriptionId: subscription.SubscriptionID,
    planId: subscription.PlanID,
    availableExamIds: planExams.map(pe => pe.ExamID)
  };
}
```

### Platform Subject Expert Validation Logic

```javascript
async function validatePlatformSubjectExpert(userId) {
  // No subscription validation needed
  // Just verify user is active and has correct role
  
  const { data: user } = await supabase
    .from('Users')
    .select('UserID, Role, Status')
    .eq('UserID', userId)
    .eq('Role', 'Subject Expert')
    .eq('Status', 'Active')
    .maybeSingle();

  if (!user) {
    return {
      valid: false,
      reason: 'User not found or inactive',
      message: 'Access denied.'
    };
  }

  return {
    valid: true,
    userId: user.UserID
  };
}
```

---

## Question Ownership & Visibility

### Organization Subject Expert Questions

**Ownership**:
- `Questions.OrgID` = Subject Expert's organization ID
- Questions belong to the organization
- Organization-specific questions are **private** to that organization

**Visibility**:
- ✅ Visible to:
  - Organization's Reviewers (for review)
  - Organization's OrgAdmins (for test creation)
  - Organization's Subject Experts (for collaboration)
- ❌ Not visible to:
  - Other organizations
  - Platform-level users (unless explicitly shared)

**Usage**:
- Can be used in tests created by the organization
- Can be used only if question is verified (`IsVerified = true`)
- Counts towards organization's question bank

### Platform Subject Expert Questions

**Ownership**:
- `Questions.OrgID` = `NULL`
- Questions belong to the platform (SaaS provider)
- Platform-wide questions are **public** to all organizations

**Visibility**:
- ✅ Visible to:
  - All organizations (for test creation)
  - Platform Reviewers (for review)
  - Platform Subject Experts (for collaboration)
  - SuperAdmin
- ❌ Not visible to:
  - Organization-specific users (unless they have access to platform questions)

**Usage**:
- Can be used in tests created by any organization
- Can be used only if question is verified (`IsVerified = true`)
- Available as part of platform's question bank
- Organizations can use these questions in "Auto Addition" mode when creating tests

---

## Review Process

### Organization Questions Review

**Reviewers**: Organization-level Reviewers (`OrgUsers` with role `'Reviewer'`)

**Process**:
1. Reviewer views unverified questions from their organization (`Questions.OrgID = Reviewer.OrgID`)
2. Reviewer can approve or reject questions
3. If approved: `IsVerified = true`, question becomes available for test creation
4. If rejected: Question is rolled back to Subject Expert with comments

**Review Scope**:
- Reviewers can only review questions from their own organization
- Cannot review questions from other organizations
- Cannot review platform-wide questions (unless explicitly granted)

### Platform Questions Review

**Reviewers**: Platform-level Reviewers (`Users` with role `'Reviewer'`)

**Process**:
1. Reviewer views unverified platform-wide questions (`Questions.OrgID IS NULL`)
2. Reviewer can approve or reject questions
3. If approved: `IsVerified = true`, question becomes available to all organizations
4. If rejected: Question is rolled back to Platform Subject Expert with comments

**Review Scope**:
- Platform Reviewers can review platform-wide questions
- May have access to review organization questions (if granted by SuperAdmin)
- Higher quality standards (questions will be used by multiple organizations)

---

## Database Schema Considerations

### Questions Table

**Current Schema**:
```sql
CREATE TABLE "Questions" (
  "QuestionID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "TopicID" uuid REFERENCES "Topics"("TopicID"),
  "QuestionText" text,
  "DifficultyLevel" difficulty_level_enum,
  "Explanation" text,
  "QuestionType" question_type_enum,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),  -- References Users table
  "CreatedAt" timestamptz DEFAULT now(),
  "IsVerified" boolean DEFAULT false,
  "VerifiedBy" uuid REFERENCES "Users"("UserID"),
  "ReviewerComments" text,
  "UpdatedBy" uuid REFERENCES "Users"("UserID"),
  "UpdatedAt" timestamptz,
  "VerifiedAt" timestamptz,
  "Source" question_source_enum,
  "TimesUsed" int DEFAULT 0,
  "TimesCorrect" int DEFAULT 0,
  "TimesIncorrect" int DEFAULT 0,
  "LastUpdated" timestamptz
);
```

**Required Changes**:

1. **Add OrgID Column** (if not exists):
```sql
ALTER TABLE "Questions"
ADD COLUMN IF NOT EXISTS "OrgID" uuid REFERENCES "Organizations"("OrgID") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_orgid ON "Questions"("OrgID");
```

2. **Add CreatedByOrgUser Column** (for Organization Subject Experts):
```sql
ALTER TABLE "Questions"
ADD COLUMN IF NOT EXISTS "CreatedByOrgUser" uuid REFERENCES "OrgUsers"("OrgUserID") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_createdbyorguser ON "Questions"("CreatedByOrgUser");
```

**Question Creation Logic**:
- **Organization Subject Expert**: 
  - Set `CreatedByOrgUser` = `OrgUserID`
  - Set `OrgID` = Subject Expert's `OrgID`
  - Set `CreatedBy` = `NULL` (or map to a system user if required)
- **Platform Subject Expert**:
  - Set `CreatedBy` = `UserID`
  - Set `CreatedByOrgUser` = `NULL`
  - Set `OrgID` = `NULL`

### Options Table

**Current Schema** (already updated):
```sql
CREATE TABLE "Options" (
  "OptionID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "QuestionID" uuid REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "OptionNumber" int,
  "OptionText" text,
  "IsCorrect" boolean DEFAULT false,
  CONSTRAINT uq_options_optionid UNIQUE ("OptionID")
);
```

**No changes needed** - Already supports both types.

### QuestionMedia Table

**Current Schema** (already implemented):
```sql
CREATE TABLE "QuestionMedia" (
  "MediaID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "QuestionID" uuid NOT NULL REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "Context" media_context_enum NOT NULL,
  "OptionID" uuid NULL REFERENCES "Options"("OptionID") ON DELETE CASCADE,
  "FilePath" varchar(500) NOT NULL,
  "Caption" text,
  "DisplayOrder" int DEFAULT 1,
  "MediaType" media_type_enum NOT NULL,
  "UploadedAt" timestamptz DEFAULT now(),
  CONSTRAINT chk_option_context CHECK (
    ("Context" = 'Option' AND "OptionID" IS NOT NULL)
    OR
    ("Context" <> 'Option' AND "OptionID" IS NULL)
  )
);
```

**No changes needed** - Works for both types.

---

## API Endpoints

### Common Endpoints (Both Types)

#### 1. Get Available Exams
```
GET /api/subject-expert/exams/available
```
**Purpose**: Get list of exams available for question creation

**Organization Subject Expert**:
- Returns only exams linked to active subscription
- Requires active subscription validation

**Platform Subject Expert**:
- Returns all exams on platform
- No subscription validation

**Response**:
```json
{
  "exams": [
    {
      "ExamID": "uuid",
      "ExamName": "MDCAT",
      "Description": "...",
      "NoOfSubjects": 4,
      "subjects": [
        {
          "SubjectID": "uuid",
          "SubjectName": "Physics",
          "topics": [...]
        }
      ]
    }
  ]
}
```

#### 2. Create Question
```
POST /api/subject-expert/questions
```
**Purpose**: Create a new question

**Request Body**:
```json
{
  "TopicID": "uuid",
  "QuestionText": "What is...?",
  "QuestionType": "Single Correct",
  "DifficultyLevel": "Medium",
  "Explanation": "Explanation text",
  "Options": [
    {
      "OptionNumber": 1,
      "OptionText": "Option A",
      "IsCorrect": true
    },
    {
      "OptionNumber": 2,
      "OptionText": "Option B",
      "IsCorrect": false
    }
  ],
  "Media": [
    {
      "Context": "Question",
      "FilePath": "/uploads/image.jpg",
      "Caption": "Diagram",
      "MediaType": "Image",
      "DisplayOrder": 1
    }
  ]
}
```

**Organization Subject Expert**:
- Validates subscription before creation
- Sets `OrgID` automatically
- Sets `CreatedByOrgUser`

**Platform Subject Expert**:
- No subscription validation
- Sets `OrgID` to `NULL`
- Sets `CreatedBy`

**Response**:
```json
{
  "success": true,
  "questionId": "uuid",
  "message": "Question created successfully"
}
```

#### 3. List My Questions
```
GET /api/subject-expert/questions
```
**Purpose**: List questions created by the Subject Expert

**Query Parameters**:
- `status`: `all`, `pending`, `approved`, `rejected`
- `examId`: Filter by exam
- `subjectId`: Filter by subject
- `topicId`: Filter by topic
- `page`: Page number
- `limit`: Items per page

**Organization Subject Expert**:
- Returns only questions from their organization

**Platform Subject Expert**:
- Returns only platform-wide questions they created

**Response**:
```json
{
  "questions": [
    {
      "QuestionID": "uuid",
      "QuestionText": "...",
      "ExamName": "MDCAT",
      "SubjectName": "Physics",
      "TopicName": "Mechanics",
      "DifficultyLevel": "Medium",
      "IsVerified": false,
      "VerifiedAt": null,
      "ReviewerComments": null,
      "CreatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

#### 4. Get Question Details
```
GET /api/subject-expert/questions/:questionId
```
**Purpose**: Get detailed information about a specific question

**Response**:
```json
{
  "QuestionID": "uuid",
  "QuestionText": "...",
  "QuestionType": "Single Correct",
  "DifficultyLevel": "Medium",
  "Explanation": "...",
  "TopicID": "uuid",
  "TopicName": "Mechanics",
  "SubjectID": "uuid",
  "SubjectName": "Physics",
  "ExamID": "uuid",
  "ExamName": "MDCAT",
  "IsVerified": false,
  "VerifiedBy": null,
  "VerifiedAt": null,
  "ReviewerComments": null,
  "Options": [
    {
      "OptionID": "uuid",
      "OptionNumber": 1,
      "OptionText": "Option A",
      "IsCorrect": true
    }
  ],
  "Media": [
    {
      "MediaID": "uuid",
      "Context": "Question",
      "FilePath": "/uploads/image.jpg",
      "Caption": "Diagram",
      "MediaType": "Image"
    }
  ],
  "CreatedAt": "2024-01-01T00:00:00Z",
  "UpdatedAt": null
}
```

#### 5. Update Question
```
PUT /api/subject-expert/questions/:questionId
```
**Purpose**: Update a question (only if not verified or rejected)

**Validation**:
- Can only update own questions
- Cannot update if `IsVerified = true` (unless rejected)
- Organization Subject Expert can only update organization questions
- Platform Subject Expert can only update platform questions

#### 6. Delete Question
```
DELETE /api/subject-expert/questions/:questionId
```
**Purpose**: Delete a question (only if not used in any test)

**Validation**:
- Can only delete own questions
- Cannot delete if question is used in any test (`TestQuestions`)
- Soft delete option (set status to 'Deleted') may be preferred

### Organization Subject Expert Specific Endpoints

#### 7. Check Subscription Status
```
GET /api/subject-expert/subscription/status
```
**Purpose**: Check if organization has active subscription

**Response**:
```json
{
  "hasActiveSubscription": true,
  "subscription": {
    "SubscriptionID": "uuid",
    "PlanID": "uuid",
    "PlanName": "Enterprise",
    "StartDate": "2024-01-01",
    "EndDate": "2024-12-31",
    "Status": "Active"
  },
  "availableExams": [
    {
      "ExamID": "uuid",
      "ExamName": "MDCAT"
    }
  ]
}
```

#### 8. Get Subscription Plans (Read-Only)
```
GET /api/subject-expert/subscription-plans
```
**Purpose**: View available subscription plans (for information only)

**Response**: List of subscription plans with details

### Platform Subject Expert Specific Endpoints

#### 9. Get All Exams (Unrestricted)
```
GET /api/platform-subject-expert/exams
```
**Purpose**: Get all exams on platform (no restrictions)

**Response**: All exams including platform-wide and organization-specific

---

## UI/UX Considerations

### Organization Subject Expert Interface

#### Dashboard
- **Subscription Status Card**:
  - Display current subscription status
  - Show active/inactive badge
  - Display subscription end date
  - Link to subscription details (if needed)
  - Warning if subscription expired or expiring soon

- **Quick Stats**:
  - Total questions created
  - Questions pending review
  - Questions approved
  - Questions rejected

- **Recent Activity**:
  - Recently created questions
  - Recently reviewed questions
  - Recent rejections with comments

#### Question Creation Page
- **Subscription Validation Banner**:
  - If no active subscription: Display prominent banner with message and link to contact admin
  - If subscription expiring soon: Display warning banner
  - If active: Show subscription details (subtle)

- **Exam Selection**:
  - Dropdown/select showing only available exams (from subscription)
  - Display exam name and description
  - Show subscription limits (if any) - e.g., "Max 100 questions per exam"

- **Question Form**:
  - Standard question creation form
  - Media upload section
  - Preview mode
  - Save as draft / Submit for review

#### My Questions Page
- **Filter Panel**:
  - Filter by status (All, Pending, Approved, Rejected)
  - Filter by exam
  - Filter by subject/topic
  - Search by question text

- **Question List**:
  - Display question preview
  - Status badges (Pending, Approved, Rejected)
  - Show reviewer comments if rejected
  - Actions: View, Edit, Delete

#### Rejected Questions View
- **Dedicated Section**:
  - List of rejected questions
  - Display reviewer comments prominently
  - Easy edit and resubmit functionality
  - Show rejection date and reviewer name

### Platform Subject Expert Interface

#### Dashboard
- **Quick Stats**:
  - Total questions created
  - Questions pending review
  - Questions approved
  - Questions rejected
  - Questions used by organizations (if tracked)

- **Recent Activity**:
  - Recently created questions
  - Recently reviewed questions
  - Recent rejections with comments

#### Question Creation Page
- **No Subscription Banner**:
  - Platform Subject Expert sees no subscription-related UI
  - Clean, unrestricted interface

- **Exam Selection**:
  - Dropdown/select showing ALL exams
  - No filtering based on subscription
  - Display exam name, description, and type (Platform-wide / Organization-specific)

- **Question Form**:
  - Same as Organization Subject Expert
  - May have additional fields for platform-level metadata (if needed)

#### My Questions Page
- **Same as Organization Subject Expert**:
  - Filter panel
  - Question list
  - Status badges
  - Actions

#### Platform Question Bank View (Optional)
- **View All Platform Questions**:
  - See questions created by other Platform Subject Experts
  - Filter and search
  - View-only (unless granted edit permissions)

### Common UI Components

#### Question Preview Card
- Question text (truncated)
- Exam, Subject, Topic badges
- Difficulty level indicator
- Status badge
- Created date
- Options preview (if applicable)
- Media thumbnail (if applicable)

#### Question Editor
- Rich text editor for question text
- Option management (add/remove/reorder)
- Media upload interface
- Preview mode
- Validation feedback

#### Status Badges
- **Pending**: Yellow/Orange badge
- **Approved**: Green badge
- **Rejected**: Red badge
- **Draft**: Gray badge (if draft feature exists)

---

## Implementation Notes

### Backend Implementation

#### Middleware for Access Control

```javascript
// Middleware to identify Subject Expert type
async function identifySubjectExpertType(req, res, next) {
  const { userId, orgUserId, actorType } = req.user;

  if (actorType === 'OrgUser') {
    // Organization Subject Expert
    const { data: orgUser } = await supabase
      .from('OrgUsers')
      .select('OrgUserID, OrgID, Role, Status')
      .eq('OrgUserID', orgUserId)
      .eq('Role', 'Subject Expert')
      .single();

    if (!orgUser || orgUser.Status !== 'Active') {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.subjectExpert = {
      type: 'Organization',
      orgUserId: orgUser.OrgUserID,
      orgId: orgUser.OrgID,
      userId: null
    };
  } else if (actorType === 'User') {
    // Platform Subject Expert
    const { data: user } = await supabase
      .from('Users')
      .select('UserID, Role, Status')
      .eq('UserID', userId)
      .eq('Role', 'Subject Expert')
      .single();

    if (!user || user.Status !== 'Active') {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.subjectExpert = {
      type: 'Platform',
      orgUserId: null,
      orgId: null,
      userId: user.UserID
    };
  } else {
    return res.status(403).json({ error: 'Invalid user type' });
  }

  next();
}

// Middleware to validate subscription (Organization only)
async function validateSubscription(req, res, next) {
  if (req.subjectExpert.type !== 'Organization') {
    return next(); // Skip for Platform Subject Expert
  }

  const validation = await validateSubscriptionForQuestionCreation(
    req.subjectExpert.orgId
  );

  if (!validation.valid) {
    return res.status(403).json({
      error: validation.reason,
      message: validation.message
    });
  }

  req.subscription = validation;
  next();
}
```

#### Question Creation Handler

```javascript
router.post('/questions', 
  identifySubjectExpertType,
  validateSubscription, // Only applies to Organization type
  async (req, res) => {
    const { TopicID, QuestionText, QuestionType, DifficultyLevel, Explanation, Options, Media } = req.body;
    const { type, orgUserId, orgId, userId } = req.subjectExpert;

    try {
      // Create question
      const questionData = {
        TopicID,
        QuestionText,
        QuestionType,
        DifficultyLevel,
        Explanation,
        Source: 'Self',
        IsVerified: false,
        CreatedAt: new Date().toISOString()
      };

      if (type === 'Organization') {
        questionData.OrgID = orgId;
        questionData.CreatedByOrgUser = orgUserId;
        questionData.CreatedBy = null; // Or map to system user
      } else {
        questionData.OrgID = null;
        questionData.CreatedBy = userId;
        questionData.CreatedByOrgUser = null;
      }

      const { data: question, error: questionError } = await supabase
        .from('Questions')
        .insert(questionData)
        .select()
        .single();

      if (questionError) throw questionError;

      // Create options
      const optionsData = Options.map((opt, index) => ({
        QuestionID: question.QuestionID,
        OptionNumber: index + 1,
        OptionText: opt.OptionText,
        IsCorrect: opt.IsCorrect
      }));

      const { error: optionsError } = await supabase
        .from('Options')
        .insert(optionsData);

      if (optionsError) throw optionsError;

      // Create media (if any)
      if (Media && Media.length > 0) {
        const mediaData = Media.map(media => ({
          QuestionID: question.QuestionID,
          Context: media.Context,
          OptionID: media.OptionID || null,
          FilePath: media.FilePath,
          Caption: media.Caption,
          DisplayOrder: media.DisplayOrder || 1,
          MediaType: media.MediaType
        }));

        const { error: mediaError } = await supabase
          .from('QuestionMedia')
          .insert(mediaData);

        if (mediaError) throw mediaError;
      }

      // Create audit log
      await createLog({
        actorType: type === 'Organization' ? 'OrgUser' : 'User',
        actorID: type === 'Organization' ? orgUserId : userId,
        actionType: 'Create',
        entityType: 'Question',
        entityID: question.QuestionID,
        description: `Question created: ${QuestionText.substring(0, 50)}...`
      });

      res.json({
        success: true,
        questionId: question.QuestionID,
        message: 'Question created successfully'
      });

    } catch (error) {
      console.error('Create question error:', error);
      res.status(500).json({
        error: 'Failed to create question',
        details: error.message
      });
    }
  }
);
```

### Frontend Implementation

#### Route Protection

```javascript
// Protected route for Subject Expert
<Route
  path="/subject-expert/*"
  element={
    <ProtectedRoute
      allowedRoles={['Subject Expert']}
      allowedActorTypes={['OrgUser', 'User']}
    >
      <SubjectExpertLayout />
    </ProtectedRoute>
  }
/>
```

#### Component: Subscription Status Check

```jsx
function SubscriptionStatusBanner() {
  const { actorType } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);

  useEffect(() => {
    if (actorType === 'OrgUser') {
      // Fetch subscription status for Organization Subject Expert
      fetchSubscriptionStatus().then(setSubscriptionStatus);
    }
  }, [actorType]);

  if (actorType === 'User') {
    // Platform Subject Expert - no banner needed
    return null;
  }

  if (!subscriptionStatus?.hasActiveSubscription) {
    return (
      <div className="subscription-banner warning">
        <p>Your organization needs an active subscription to create questions.</p>
        <Link to="/contact-admin">Contact Administrator</Link>
      </div>
    );
  }

  if (subscriptionStatus.subscription.endDate < addDays(new Date(), 7)) {
    return (
      <div className="subscription-banner info">
        <p>Your subscription expires on {subscriptionStatus.subscription.endDate}</p>
      </div>
    );
  }

  return null;
}
```

#### Component: Exam Selection

```jsx
function ExamSelector() {
  const { actorType } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint = actorType === 'OrgUser'
      ? '/api/subject-expert/exams/available'
      : '/api/platform-subject-expert/exams';

    fetch(endpoint)
      .then(res => res.json())
      .then(data => {
        setExams(data.exams);
        setLoading(false);
      });
  }, [actorType]);

  // Render exam selection UI
}
```

---

## Summary

This document outlines the complete workflow for both Organization and Platform Subject Experts:

1. **Organization Subject Expert**:
   - Requires active subscription
   - Creates organization-specific questions
   - Restricted to subscribed exams
   - Questions are private to organization

2. **Platform Subject Expert**:
   - No subscription required
   - Creates platform-wide questions
   - Unrestricted access to all exams
   - Questions are public to all organizations

The system design ensures proper access control, subscription validation, and question ownership while maintaining a consistent user experience for both types of Subject Experts.

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]  
**Status**: Planning Phase
