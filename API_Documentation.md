# ProPath API Documentation

## Base URL
```
http://localhost:3001
```

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Table of Contents

1. [Health Check](#health-check)
2. [Organization Authentication APIs](#organization-authentication-apis)
3. [Organization User Management APIs](#organization-user-management-apis)
4. [Organization Dashboard APIs](#organization-dashboard-apis)
5. [Questions APIs (Subject Expert)](#questions-apis-subject-expert)
6. [Reviewer APIs](#reviewer-apis)
7. [Super Admin APIs](#super-admin-apis)

---

## Health Check

### GET /health
Check if the API server is running.

**Authentication:** None

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Organization Authentication APIs

Base Path: `/api/org/auth`

### POST /api/org/auth/signup
Organization self-signup. Creates an organization and an OrgAdmin user account.

**Authentication:** None

**Request Body:**
```json
{
  "orgName": "ProPath Academy",
  "orgEmail": "contact@org.com",
  "password": "password123",
  "phone": "+92 300 0000000",
  "address": "123 Main Street, City"
}
```

**Response (201):**
```json
{
  "message": "Organization created successfully",
  "organization": {
    "orgId": "uuid",
    "orgName": "ProPath Academy",
    "orgEmail": "contact@org.com"
  },
  "admin": {
    "userId": "uuid",
    "email": "contact@org.com",
    "role": "OrgAdmin"
  }
}
```

**Errors:**
- `409` - Organization email already registered
- `500` - Failed to create organization

---

### POST /api/org/auth/login
Login for Organization users (OrgAdmin, Reviewer, Subject Expert) or Platform users (Reviewer, Subject Expert).

**Authentication:** None

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "userId": "uuid",
    "fullName": "John Doe",
    "email": "user@example.com",
    "role": "OrgAdmin",
    "orgId": "uuid",
    "orgName": "Organization Name"
  }
}
```

**Errors:**
- `401` - Invalid email or password
- `403` - Account is inactive/suspended

---

### GET /api/org/auth/dashboard/stats
Get organization dashboard statistics with charts data (OrgAdmin only).

**Authentication:** Required (OrgAdmin)

**Response (200):**
```json
{
  "stats": {
    "totalUsers": 10,
    "totalTests": 5,
    "activeTests": 2,
    "completedTests": 3
  },
  "userGrowthData": [
    { "date": "Jan 1", "users": 2 },
    { "date": "Jan 2", "users": 1 }
  ],
  "testGrowthData": [
    { "date": "Jan 1", "tests": 1 },
    { "date": "Jan 2", "tests": 2 }
  ],
  "attemptsTrendData": [
    { "date": "Jan 1", "attempts": 5 },
    { "date": "Jan 2", "attempts": 8 }
  ],
  "roleDistribution": [
    { "name": "OrgAdmin", "value": 1 },
    { "name": "Reviewer", "value": 3 },
    { "name": "Subject Expert", "value": 6 }
  ],
  "testStatusData": [
    { "name": "Active", "value": 2 },
    { "name": "Inactive", "value": 1 },
    { "name": "Completed", "value": 3 }
  ]
}
```

---

### GET /api/org/auth/exams/explore
Get all exams for exploration (read-only view for OrgAdmin).

**Authentication:** Required (OrgAdmin)

**Response (200):**
```json
{
  "exams": [
    {
      "ExamID": "uuid",
      "ExamName": "Mathematics Exam",
      "Description": "Basic math exam",
      "Syllabus": "Algebra, Geometry",
      "NoOfSubjects": 2,
      "OrgID": "uuid",
      "OrgName": "Organization Name",
      "CreatedAt": "2024-01-01T00:00:00.000Z",
      "SubjectCount": 2
    }
  ]
}
```

---

## Organization User Management APIs

Base Path: `/api/org/users`

### POST /api/org/users
Create a new Reviewer or Subject Expert user in the organization (OrgAdmin only).

**Authentication:** Required (OrgAdmin)

**Request Body:**
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+92 300 0000000",
  "role": "Reviewer"
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "user": {
    "userId": "uuid",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "Reviewer",
    "status": "Active"
  }
}
```

**Errors:**
- `409` - Email already registered
- `400` - Validation failed

---

### GET /api/org/users
List all users in the organization (OrgAdmin only).

**Authentication:** Required (OrgAdmin)

**Response (200):**
```json
{
  "users": [
    {
      "OrgUserID": "uuid",
      "FullName": "John Doe",
      "Email": "john@example.com",
      "Role": "Reviewer",
      "Phone": "+92 300 0000000",
      "Status": "Active",
      "CreatedAt": "2024-01-01T00:00:00.000Z",
      "LastLogin": "2024-01-15T00:00:00.000Z"
    }
  ]
}
```

---

## Questions APIs (Subject Expert)

Base Path: `/api/questions`

### GET /api/questions
Get all questions for the logged-in Subject Expert. Filters by organization if user is OrgUser.

**Authentication:** Required (Subject Expert)

**Response (200):**
```json
{
  "questions": [
    {
      "QuestionID": "uuid",
      "QuestionText": "What is 2+2?",
      "DifficultyLevel": "Easy",
      "IsVerified": true,
      "ExamName": "Mathematics Exam",
      "SubjectName": "Algebra",
      "TopicName": "Basic Operations",
      "CreatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### GET /api/questions/:questionId
Get question details with options.

**Authentication:** Required (Subject Expert)

**Response (200):**
```json
{
  "question": {
    "QuestionID": "uuid",
    "QuestionText": "What is 2+2?",
    "DifficultyLevel": "Easy",
    "QuestionType": "Single Correct",
    "Explanation": "Basic addition",
    "IsVerified": true,
    "ExamName": "Mathematics Exam",
    "SubjectName": "Algebra",
    "TopicName": "Basic Operations"
  },
  "options": [
    {
      "OptionID": "uuid",
      "OptionText": "4",
      "IsCorrect": true,
      "Order": 1
    }
  ]
}
```

---

### POST /api/questions
Create a new question (Subject Expert only).

**Authentication:** Required (Subject Expert)

**Request Body:**
```json
{
  "topicId": "uuid",
  "questionText": "What is 2+2?",
  "difficultyLevel": "Easy",
  "explanation": "Basic addition",
  "questionType": "Single Correct",
  "options": [
    {
      "optionText": "4",
      "isCorrect": true,
      "order": 1
    },
    {
      "optionText": "5",
      "isCorrect": false,
      "order": 2
    }
  ],
  "source": "Textbook Chapter 1",
  "orgId": "uuid"
}
```

**Response (201):**
```json
{
  "message": "Question created successfully",
  "question": {
    "QuestionID": "uuid",
    "QuestionText": "What is 2+2?",
    "DifficultyLevel": "Easy",
    "QuestionType": "Single Correct"
  }
}
```

**Errors:**
- `400` - Validation failed (missing fields, invalid options, etc.)

---

### PUT /api/questions/:questionId
Update a question (Subject Expert only).

**Authentication:** Required (Subject Expert)

**Request Body:** (Same as POST, all fields optional)

**Response (200):**
```json
{
  "message": "Question updated successfully",
  "question": { ... }
}
```

---

### DELETE /api/questions/:questionId
Delete a question (Subject Expert only).

**Authentication:** Required (Subject Expert)

**Response (200):**
```json
{
  "message": "Question deleted successfully"
}
```

---

### GET /api/questions/exams/list
Get list of exams, subjects, and topics for question creation (Subject Expert only).

**Authentication:** Required (Subject Expert)

**Response (200):**
```json
{
  "exams": [
    {
      "ExamID": "uuid",
      "ExamName": "Mathematics Exam",
      "Description": "Basic math exam",
      "NoOfSubjects": 2,
      "OrgID": "uuid",
      "subjects": [
        {
          "SubjectID": "uuid",
          "SubjectName": "Algebra",
          "Description": "Basic algebra",
          "Weightage": 50,
          "topics": [
            {
              "TopicID": "uuid",
              "TopicName": "Basic Operations",
              "Description": "Addition, subtraction"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### POST /api/questions/topics
Create a topic for a subject (Subject Expert only). Used when creating questions and need to create a new topic.

**Authentication:** Required (Subject Expert)

**Request Body:**
```json
{
  "examId": "uuid",
  "subjectId": "uuid",
  "topicName": "Advanced Algebra",
  "description": "Complex algebraic equations"
}
```

**Response (201):**
```json
{
  "message": "Topic created successfully",
  "topic": {
    "TopicID": "uuid",
    "TopicName": "Advanced Algebra",
    "SubjectID": "uuid",
    "Description": "Complex algebraic equations"
  }
}
```

---

### GET /api/questions/dashboard/stats
Get dashboard statistics for Subject Expert.

**Authentication:** Required (Subject Expert)

**Response (200):**
```json
{
  "stats": {
    "total": 50,
    "approved": 40,
    "pending": 5,
    "rejected": 5,
    "qualityScore": 80,
    "totalUsed": 100,
    "accuracyRate": 85
  },
  "recentQuestions": [...],
  "statusData": [
    { "status": "Approved", "count": 40 },
    { "status": "Pending", "count": 5 },
    { "status": "Rejected", "count": 5 }
  ],
  "trendData": [
    { "date": "Jan 1", "count": 2 },
    { "date": "Jan 2", "count": 3 }
  ]
}
```

---

## Reviewer APIs

Base Path: `/api/reviewers`

### GET /api/reviewers/dashboard/stats
Get dashboard statistics for Reviewer.

**Authentication:** Required (Reviewer)

**Response (200):**
```json
{
  "stats": {
    "pending": 10,
    "approved": 50,
    "rejected": 5,
    "totalReviewed": 55,
    "reviewedByMe": 30
  },
  "recentReviews": [...],
  "statusData": [
    { "status": "Pending", "count": 10 },
    { "status": "Approved", "count": 50 },
    { "status": "Rejected", "count": 5 }
  ],
  "trendData": [
    { "date": "Jan 1", "count": 2 },
    { "date": "Jan 2", "count": 3 }
  ]
}
```

---

### GET /api/reviewers/questions
Get questions for review.

**Authentication:** Required (Reviewer)

**Query Parameters:**
- `status` (optional): `pending`, `approved`, `rejected` (default: `pending`)
- `limit` (optional): Number of questions (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200):**
```json
{
  "questions": [
    {
      "QuestionID": "uuid",
      "QuestionText": "What is 2+2?",
      "DifficultyLevel": "Easy",
      "IsVerified": false,
      "CreatedAt": "2024-01-01T00:00:00.000Z",
      "CreatorName": "John Doe",
      "ExamName": "Mathematics Exam",
      "SubjectName": "Algebra",
      "TopicName": "Basic Operations"
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/reviewers/questions/:questionId
Get question details with options and creator info.

**Authentication:** Required (Reviewer)

**Response (200):**
```json
{
  "question": {
    "QuestionID": "uuid",
    "QuestionText": "What is 2+2?",
    "DifficultyLevel": "Easy",
    "QuestionType": "Single Correct",
    "Explanation": "Basic addition",
    "IsVerified": false,
    "CreatorName": "John Doe",
    "CreatorEmail": "john@example.com",
    "ExamName": "Mathematics Exam",
    "SubjectName": "Algebra",
    "TopicName": "Basic Operations"
  },
  "options": [
    {
      "OptionID": "uuid",
      "OptionText": "4",
      "IsCorrect": true,
      "Order": 1
    }
  ]
}
```

---

### POST /api/reviewers/questions/:questionId/approve
Approve a question.

**Authentication:** Required (Reviewer)

**Response (200):**
```json
{
  "message": "Question approved successfully"
}
```

---

### POST /api/reviewers/questions/:questionId/reject
Reject a question with comments.

**Authentication:** Required (Reviewer)

**Request Body:**
```json
{
  "comments": "Question is unclear. Please revise."
}
```

**Response (200):**
```json
{
  "message": "Question rejected successfully"
}
```

---

### GET /api/reviewers/experts/performance
Get Subject Expert performance metrics.

**Authentication:** Required (Reviewer)

**Response (200):**
```json
{
  "experts": [
    {
      "expertId": "uuid",
      "expertName": "John Doe",
      "totalQuestions": 50,
      "approvedQuestions": 40,
      "rejectedQuestions": 5,
      "pendingQuestions": 5,
      "approvalRate": 80,
      "averageQuality": 4.5
    }
  ]
}
```

---

## Super Admin APIs

Base Path: `/api/admin`

### POST /api/admin/login
Super Admin login.

**Authentication:** None

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "userId": "uuid",
    "fullName": "Super Admin",
    "email": "admin@example.com",
    "role": "SuperAdmin"
  }
}
```

---

### GET /api/admin/dashboard/stats
Get high-level dashboard statistics (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "stats": {
    "activeOrgs": 10,
    "totalOrgs": 15,
    "totalRevenue": 50000,
    "totalUsers": 100,
    "totalStudents": 500,
    "totalTests": 50,
    "totalQuestions": 1000,
    "approvedQuestions": 800,
    "pendingQuestions": 150,
    "rejectedQuestions": 50
  },
  "revenueData": [
    { "date": "Jan 1", "revenue": 1000 },
    { "date": "Jan 2", "revenue": 1500 }
  ],
  "userGrowthData": [...],
  "questionsTrendData": [...],
  "orgStatusData": [
    { "name": "Active", "value": 10 },
    { "name": "Inactive", "value": 3 },
    { "name": "Suspended", "value": 2 }
  ],
  "roleDistribution": [...],
  "questionsStatusData": [...],
  "topOrganizations": [...],
  "alerts": [...],
  "systemHealth": {
    "cpu": 35,
    "latency": 120,
    "status": "healthy"
  }
}
```

---

### GET /api/admin/organizations
List all organizations with details (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "organizations": [
    {
      "OrgID": "uuid",
      "OrgName": "ProPath Academy",
      "OrgEmail": "contact@org.com",
      "Address": "123 Main Street",
      "Phone": "+92 300 0000000",
      "Status": "Active",
      "CreatedAt": "2024-01-01T00:00:00.000Z",
      "CreatedBy": "uuid"
    }
  ]
}
```

---

### POST /api/admin/organizations/create
Create a new organization with OrgAdmin user (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "orgName": "ProPath Academy",
  "orgEmail": "contact@org.com",
  "phone": "+92 300 0000000",
  "address": "123 Main Street, City",
  "status": "Active",
  "adminFullName": "John Doe",
  "adminPassword": "password123",
  "adminRole": "OrgAdmin"
}
```

**Response (201):**
```json
{
  "message": "Organization created successfully",
  "organization": {
    "orgId": "uuid",
    "orgName": "ProPath Academy",
    "orgEmail": "contact@org.com",
    "status": "Active"
  },
  "admin": {
    "userId": "uuid",
    "fullName": "John Doe",
    "email": "contact@org.com",
    "role": "OrgAdmin",
    "status": "Active"
  }
}
```

---

### PUT /api/admin/organizations/:orgId
Update an organization (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "orgName": "Updated Name",
  "orgEmail": "newemail@org.com",
  "phone": "+92 300 0000000",
  "address": "New Address",
  "status": "Active"
}
```

**Response (200):**
```json
{
  "message": "Organization updated successfully",
  "organization": { ... }
}
```

---

### DELETE /api/admin/organizations/:orgId
Delete an organization (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "message": "Organization deleted successfully"
}
```

---

### GET /api/admin/users
List all platform users and organization users (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "platformUsers": [
    {
      "UserID": "uuid",
      "FullName": "John Doe",
      "Email": "john@example.com",
      "Role": "Reviewer",
      "Phone": "+92 300 0000000",
      "Status": "Active",
      "CreatedAt": "2024-01-01T00:00:00.000Z",
      "LastLogin": "2024-01-15T00:00:00.000Z"
    }
  ],
  "orgUsers": [
    {
      "OrgUserID": "uuid",
      "OrgID": "uuid",
      "FullName": "Jane Doe",
      "Email": "jane@example.com",
      "Role": "OrgAdmin",
      "OrgName": "Organization Name",
      "Status": "Active",
      "CreatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST /api/admin/users/create
Create a platform-level user (Reviewer or Subject Expert) (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+92 300 0000000",
  "role": "Reviewer"
}
```

**Response (201):**
```json
{
  "message": "Platform user created successfully",
  "user": {
    "userId": "uuid",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "Reviewer",
    "status": "Active",
    "userType": "Platform"
  }
}
```

---

### PUT /api/admin/users/:userId
Update a platform-level user (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:** (All fields optional)
```json
{
  "fullName": "Updated Name",
  "email": "newemail@example.com",
  "password": "newpassword123",
  "phone": "+92 300 0000000",
  "role": "Subject Expert",
  "status": "Active"
}
```

**Response (200):**
```json
{
  "message": "User updated successfully",
  "user": { ... }
}
```

---

### DELETE /api/admin/users/:userId
Delete a platform-level user (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "message": "User deleted successfully"
}
```

---

### PUT /api/admin/users/org/:orgUserId
Update an organization user (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:** (All fields optional)
```json
{
  "fullName": "Updated Name",
  "email": "newemail@example.com",
  "password": "newpassword123",
  "phone": "+92 300 0000000",
  "role": "Reviewer",
  "status": "Active"
}
```

**Response (200):**
```json
{
  "message": "Organization user updated successfully",
  "user": { ... }
}
```

---

### DELETE /api/admin/users/org/:orgUserId
Delete an organization user (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "message": "Organization user deleted successfully"
}
```

---

## Exam Management APIs (SuperAdmin Only)

Base Path: `/api/admin/exams`

### GET /api/admin/exams
Get all exams across all organizations (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "exams": [
    {
      "ExamID": "uuid",
      "ExamName": "Mathematics Exam",
      "Description": "Basic math exam",
      "Syllabus": "Algebra, Geometry",
      "NoOfSubjects": 2,
      "OrgID": "uuid",
      "OrgName": "Organization Name",
      "CreatedBy": "uuid",
      "CreatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### GET /api/admin/exams/:examId
Get exam details with subjects and topics (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "exam": {
    "ExamID": "uuid",
    "ExamName": "Mathematics Exam",
    "Description": "Basic math exam",
    "Syllabus": "Algebra, Geometry",
    "NoOfSubjects": 2,
    "OrgID": "uuid",
    "OrgName": "Organization Name"
  },
  "subjects": [
    {
      "SubjectID": "uuid",
      "SubjectName": "Algebra",
      "Description": "Basic algebra",
      "Weightage": 50,
      "ExamID": "uuid",
      "topics": [
        {
          "TopicID": "uuid",
          "TopicName": "Basic Operations",
          "Description": "Addition, subtraction",
          "SubjectID": "uuid"
        }
      ]
    }
  ]
}
```

---

### POST /api/admin/exams
Create a new exam (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "examName": "Mathematics Exam",
  "description": "Basic math exam",
  "syllabus": "Algebra, Geometry",
  "noOfSubjects": 2,
  "orgId": "uuid"
}
```

**Response (201):**
```json
{
  "message": "Exam created successfully",
  "exam": {
    "ExamID": "uuid",
    "ExamName": "Mathematics Exam",
    "Description": "Basic math exam",
    "Syllabus": "Algebra, Geometry",
    "NoOfSubjects": 2,
    "OrgID": "uuid",
    "CreatedBy": "uuid"
  }
}
```

---

### PUT /api/admin/exams/:examId
Update an exam (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "examName": "Updated Exam Name",
  "description": "Updated description",
  "syllabus": "Updated syllabus",
  "noOfSubjects": 3,
  "orgId": "uuid"
}
```

**Response (200):**
```json
{
  "message": "Exam updated successfully",
  "exam": { ... }
}
```

---

### DELETE /api/admin/exams/:examId
Delete an exam (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "message": "Exam deleted successfully"
}
```

---

### POST /api/admin/exams/:examId/subjects
Create a subject for an exam (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "subjectName": "Algebra",
  "description": "Basic algebra",
  "weightage": 50
}
```

**Response (201):**
```json
{
  "message": "Subject created successfully",
  "subject": {
    "SubjectID": "uuid",
    "SubjectName": "Algebra",
    "Description": "Basic algebra",
    "Weightage": 50,
    "ExamID": "uuid"
  }
}
```

---

### PUT /api/admin/exams/:examId/subjects/:subjectId
Update a subject (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "subjectName": "Updated Algebra",
  "description": "Updated description",
  "weightage": 60
}
```

**Response (200):**
```json
{
  "message": "Subject updated successfully",
  "subject": { ... }
}
```

---

### DELETE /api/admin/exams/:examId/subjects/:subjectId
Delete a subject (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "message": "Subject deleted successfully"
}
```

---

### POST /api/admin/exams/:examId/subjects/:subjectId/topics
Create a topic for a subject (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "topicName": "Basic Operations",
  "description": "Addition, subtraction"
}
```

**Response (201):**
```json
{
  "message": "Topic created successfully",
  "topic": {
    "TopicID": "uuid",
    "TopicName": "Basic Operations",
    "Description": "Addition, subtraction",
    "SubjectID": "uuid"
  }
}
```

---

### PUT /api/admin/exams/:examId/subjects/:subjectId/topics/:topicId
Update a topic (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Request Body:**
```json
{
  "topicName": "Updated Topic Name",
  "description": "Updated description"
}
```

**Response (200):**
```json
{
  "message": "Topic updated successfully",
  "topic": { ... }
}
```

---

### DELETE /api/admin/exams/:examId/subjects/:subjectId/topics/:topicId
Delete a topic (SuperAdmin only).

**Authentication:** Required (SuperAdmin)

**Response (200):**
```json
{
  "message": "Topic deleted successfully"
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    {
      "msg": "Email is required",
      "param": "email"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "No token provided"
}
```
or
```json
{
  "error": "Invalid token"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions"
}
```
or
```json
{
  "error": "Account is inactive"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 409 Conflict
```json
{
  "error": "Email already registered"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "details": "Error message details"
}
```

---

## Authentication Flow

1. **Organization Signup/Login**: Use `/api/org/auth/signup` or `/api/org/auth/login` to get a JWT token
2. **Super Admin Login**: Use `/api/admin/login` to get a JWT token
3. **Include Token**: Add `Authorization: Bearer <token>` header to all authenticated requests
4. **Token Expiry**: Tokens expire after a set period (check JWT configuration)

---

## Role-Based Access Control

- **SuperAdmin**: Full system access, can manage organizations, users, exams
- **OrgAdmin**: Organization-specific access, can manage organization users, view dashboard
- **Reviewer**: Can review and approve/reject questions
- **Subject Expert**: Can create and manage questions

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- All UUIDs are strings
- Password fields are never returned in responses
- All endpoints use JSON for request/response bodies
- CORS is enabled for cross-origin requests
- Rate limiting may be applied in production

---

## Version

**API Version:** 1.0.0  
**Last Updated:** 2024-01-01

