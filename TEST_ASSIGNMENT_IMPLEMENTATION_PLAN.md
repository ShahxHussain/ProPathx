# Test Assignment Implementation Plan

## Executive Summary

This document outlines the plan for implementing selective test assignment functionality. Currently, the database schema only supports organization-wide test visibility, which means **all students in an organization can see all tests** for that organization. This document explains why the current approach is insufficient and provides a detailed plan for implementing a `TestAssignments` table.

---

## Current Database State

### Existing Schema

**Tests Table:**
```sql
CREATE TABLE "Tests" (
  "TestID" uuid PRIMARY KEY,
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "ExamID" uuid REFERENCES "Exams"("ExamID"),
  "TestName" text,
  "TestType" test_type_enum,
  "Status" status_organizations_enum,
  "StartTime" timestamptz,
  "EndTime" timestamptz,
  -- ... other fields
);
```

**Students Table:**
```sql
CREATE TABLE "Students" (
  "StudentID" uuid PRIMARY KEY,
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "FullName" text,
  "Email" text,
  "Status" status_users_enum,
  -- ... other fields
);
```

**StudentAttempts Table:**
```sql
CREATE TABLE "StudentAttempts" (
  "AttemptID" uuid PRIMARY KEY,
  "StudentID" uuid REFERENCES "Students"("StudentID"),
  "TestID" uuid REFERENCES "Tests"("TestID"),
  "StartTime" timestamptz,
  "EndTime" timestamptz,
  -- ... other fields
);
```

---

## Current Test Visibility Logic

### How Tests Are Currently Visible to Students

**Current Implementation (Implicit Assignment):**
```sql
-- A student can see a test if:
SELECT t.* FROM "Tests" t
WHERE t."OrgID" = <Student's OrgID>
  AND t."Status" = 'Active'
  AND NOW() BETWEEN t."StartTime" AND t."EndTime"
```

**What This Means:**
- ✅ **All students** in an organization can see **all active tests** for that organization
- ✅ Simple and straightforward - no assignment needed
- ❌ **Cannot selectively assign** tests to specific students
- ❌ **Cannot assign** tests to specific groups
- ❌ **Cannot track** which students were explicitly assigned vs. just seeing it
- ❌ **No assignment status** tracking (Pending, Completed, etc.)
- ❌ **No assignment history** or audit trail
- ❌ **No notification targeting** - can't notify only assigned students

---

## Why Current Approach Is Not Suitable

### 1. **Lack of Selective Assignment**

**Problem:**
- OrgAdmin creates a test for "Advanced Batch 2024"
- All students in the organization can see it, including beginners
- No way to restrict visibility to only the "Advanced Batch 2024" group

**Impact:**
- Students see tests they shouldn't have access to
- Confusion and potential security issues
- Cannot implement group-based test distribution

### 2. **No Assignment Tracking**

**Problem:**
- Cannot track which students were explicitly assigned a test
- Cannot differentiate between:
  - A student who was assigned the test
  - A student who just happens to see it because they're in the same org

**Impact:**
- No audit trail for assignments
- Cannot generate reports on "assigned vs. attempted"
- Difficult to track assignment compliance

### 3. **No Assignment Status Management**

**Problem:**
- Cannot track assignment lifecycle:
  - Pending (assigned but not started)
  - InProgress (student started the test)
  - Completed (student finished)
  - Expired (test deadline passed)

**Impact:**
- Cannot send targeted reminders to students who haven't started
- Cannot track completion rates
- No way to identify students who need follow-up

### 4. **No Group-Based Assignment**

**Problem:**
- Even though `StudentGroups` and `StudentGroupMembers` tables exist
- Cannot assign a test to a specific group
- Must manually identify and notify group members

**Impact:**
- Inefficient workflow for group-based testing
- Higher chance of missing students
- No way to bulk assign to multiple groups

### 5. **No Notification Targeting**

**Problem:**
- When a test is created, cannot notify only assigned students
- Would need to notify all students in the organization
- Spam and irrelevant notifications

**Impact:**
- Poor user experience
- Notification fatigue
- Students ignore notifications because they're not relevant

### 6. **No Assignment History**

**Problem:**
- Cannot see when a test was assigned to a student
- Cannot see who assigned it
- Cannot track assignment changes

**Impact:**
- No accountability
- Difficult to debug assignment issues
- No compliance tracking

---

## Proposed Solution: TestAssignments Table

### Schema Design

```sql
CREATE TABLE "TestAssignments" (
  "AssignmentID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "TestID" uuid REFERENCES "Tests"("TestID") ON DELETE CASCADE,
  "StudentID" uuid REFERENCES "Students"("StudentID") ON DELETE CASCADE,
  "GroupID" uuid REFERENCES "StudentGroups"("GroupID") ON DELETE SET NULL,
  "AssignmentType" text NOT NULL, -- 'Single', 'Group', 'All', 'Multiple'
  "AssignedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "AssignedAt" timestamptz DEFAULT now(),
  "Status" text DEFAULT 'Pending', -- 'Pending', 'InProgress', 'Completed', 'Expired'
  "DueDate" timestamptz,
  UNIQUE("TestID", "StudentID")
);

-- Indexes for performance
CREATE INDEX "idx_testassignments_testid" ON "TestAssignments"("TestID");
CREATE INDEX "idx_testassignments_studentid" ON "TestAssignments"("StudentID");
CREATE INDEX "idx_testassignments_groupid" ON "TestAssignments"("GroupID");
CREATE INDEX "idx_testassignments_status" ON "TestAssignments"("Status");
```

### Key Features

1. **Selective Assignment**
   - Assign to single student
   - Assign to multiple selected students
   - Assign to one group
   - Assign to multiple groups
   - Assign to all students (creates records for all active students)

2. **Assignment Tracking**
   - Track who assigned the test
   - Track when it was assigned
   - Track assignment type (Single, Group, All, Multiple)

3. **Status Management**
   - `Pending`: Assigned but not started
   - `InProgress`: Student has started the test
   - `Completed`: Student has completed the test
   - `Expired`: Test deadline has passed

4. **Group Association**
   - `GroupID` field links assignment to a group (for group assignments)
   - Helps track which group the assignment came from

5. **Due Date Support**
   - Optional `DueDate` field for deadline tracking
   - Can be used for reminders and expiration logic

---

## Implementation Plan

### Phase 1: Database Migration

**Step 1.1: Create TestAssignments Table**
- Run migration script: `backend/migrations/create_test_assignments_table.sql`
- Verify table creation and indexes
- Test foreign key constraints

**Step 1.2: Data Migration (if needed)**
- If existing tests need to be assigned to all students:
  ```sql
  -- Example: Assign all existing active tests to all active students
  INSERT INTO "TestAssignments" ("TestID", "StudentID", "AssignmentType", "Status")
  SELECT t."TestID", s."StudentID", 'All', 'Pending'
  FROM "Tests" t
  CROSS JOIN "Students" s
  WHERE t."OrgID" = s."OrgID"
    AND t."Status" = 'Active'
    AND s."Status" = 'Active'
    AND NOT EXISTS (
      SELECT 1 FROM "TestAssignments" ta
      WHERE ta."TestID" = t."TestID" AND ta."StudentID" = s."StudentID"
    );
  ```

### Phase 2: Backend API Implementation

**Step 2.1: Assignment Endpoints** ✅ **COMPLETED**
- `POST /api/org/tests/:testId/assign/single` - Assign to single student
- `POST /api/org/tests/:testId/assign/multiple` - Assign to multiple students
- `POST /api/org/tests/:testId/assign/group` - Assign to one group
- `POST /api/org/tests/:testId/assign/groups` - Assign to multiple groups
- `POST /api/org/tests/:testId/assign/all` - Assign to all students
- `GET /api/org/tests/:testId/assignments` - Get all assignments for a test

**Step 2.2: Student Test Visibility Endpoint** ⚠️ **TO BE IMPLEMENTED**
- `GET /api/student/tests` - Get tests assigned to the logged-in student
- Should filter by:
  - `TestAssignments.StudentID = <studentId>`
  - `Tests.Status = 'Active'`
  - `NOW() BETWEEN Tests.StartTime AND Tests.EndTime`
  - `TestAssignments.Status IN ('Pending', 'InProgress')`

**Step 2.3: Status Update Logic** ⚠️ **TO BE IMPLEMENTED**
- When student starts test: Update `Status = 'InProgress'`
- When student completes test: Update `Status = 'Completed'`
- Scheduled job to update expired assignments: `Status = 'Expired'`

### Phase 3: Frontend Implementation

**Step 3.1: Assignment UI** ✅ **COMPLETED**
- AssignTestModal component with all assignment types
- Integration with Tests page

**Step 3.2: Student Test View** ⚠️ **TO BE IMPLEMENTED**
- Student dashboard showing only assigned tests
- Filter by status (Pending, InProgress, Completed)
- Test start/attempt functionality

**Step 3.3: Assignment Management** ⚠️ **TO BE IMPLEMENTED**
- View all assignments for a test
- Remove assignments
- Resend notifications
- Track completion rates

### Phase 4: Notification Integration

**Step 4.1: Assignment Notifications** ⚠️ **TO BE IMPLEMENTED**
- Send notification when test is assigned
- Notification should include:
  - Test name
  - Test date and time
  - Assignment type (if from group, mention group name)
  - Link to test

**Step 4.2: Reminder Notifications** ⚠️ **TO BE IMPLEMENTED**
- Remind students with `Status = 'Pending'` before test date
- Remind students with `Status = 'InProgress'` if test is ending soon

### Phase 5: Migration Strategy

**Option A: Gradual Migration (Recommended)**
1. Deploy TestAssignments table
2. New tests use assignment system
3. Existing tests remain visible to all (backward compatible)
4. Gradually assign existing tests as needed

**Option B: Full Migration**
1. Deploy TestAssignments table
2. Run data migration to assign all existing tests to all students
3. Update student test visibility logic to use TestAssignments
4. Remove old visibility logic

**Recommendation: Option A** - Less disruptive, allows gradual transition

---

## Updated Test Visibility Logic

### Before (Current)
```sql
-- Student sees all tests in their organization
SELECT * FROM "Tests"
WHERE "OrgID" = <Student's OrgID>
  AND "Status" = 'Active'
  AND NOW() BETWEEN "StartTime" AND "EndTime"
```

### After (With TestAssignments)
```sql
-- Student sees only assigned tests
SELECT t.* FROM "Tests" t
INNER JOIN "TestAssignments" ta ON t."TestID" = ta."TestID"
WHERE ta."StudentID" = <Student's StudentID>
  AND t."Status" = 'Active'
  AND NOW() BETWEEN t."StartTime" AND t."EndTime"
  AND ta."Status" IN ('Pending', 'InProgress')
```

---

## Benefits of TestAssignments Table

### 1. **Selective Access Control**
- Assign tests to specific students or groups
- Prevent unauthorized access
- Better security and organization

### 2. **Assignment Tracking**
- Know exactly who was assigned what
- Track assignment history
- Audit trail for compliance

### 3. **Status Management**
- Track student progress (Pending → InProgress → Completed)
- Identify students who need reminders
- Generate completion reports

### 4. **Group Support**
- Assign to groups efficiently
- Track group-based assignments
- Support multiple groups per test

### 5. **Notification Targeting**
- Send notifications only to assigned students
- Reduce notification spam
- Better user experience

### 6. **Analytics & Reporting**
- Assignment rates
- Completion rates
- Time-to-completion metrics
- Group performance comparisons

### 7. **Flexibility**
- Support multiple assignment types
- Easy to extend with new features
- Scalable for large organizations

---

## Potential Challenges & Solutions

### Challenge 1: Performance with Large Organizations
**Problem:** If an organization has 10,000 students, assigning to "all" creates 10,000 records.

**Solution:**
- Batch insert operations
- Use database transactions
- Consider background job for large assignments
- Index optimization

### Challenge 2: Data Consistency
**Problem:** What if a student is removed from a group after assignment?

**Solution:**
- Keep `GroupID` for historical reference
- Assignment remains valid even if student leaves group
- Use `Status` field to handle edge cases

### Challenge 3: Backward Compatibility
**Problem:** Existing code expects all students to see all tests.

**Solution:**
- Gradual migration approach
- Feature flag to switch between old and new logic
- Update all relevant endpoints gradually

### Challenge 4: Duplicate Assignments
**Problem:** Same student assigned multiple times (single + group).

**Solution:**
- `UNIQUE("TestID", "StudentID")` constraint prevents duplicates
- Backend validation before insert
- Handle gracefully in UI

---

## Migration Checklist

### Pre-Migration
- [ ] Review and approve schema design
- [ ] Test migration script on development database
- [ ] Backup production database
- [ ] Plan downtime window (if needed)

### Migration
- [ ] Run `create_test_assignments_table.sql`
- [ ] Verify table and indexes created
- [ ] Test foreign key constraints
- [ ] Run data migration (if Option B)

### Post-Migration
- [ ] Update backend test visibility logic
- [ ] Update student test endpoints
- [ ] Test assignment functionality
- [ ] Monitor performance
- [ ] Update documentation

---

## Conclusion

The current database schema **does support organization-wide test visibility** (all students see all tests), but it **does NOT support selective assignment**. The `TestAssignments` table is essential for:

1. ✅ Selective test assignment (single, multiple, groups, all)
2. ✅ Assignment tracking and audit trail
3. ✅ Status management (Pending, InProgress, Completed, Expired)
4. ✅ Targeted notifications
5. ✅ Analytics and reporting
6. ✅ Better security and access control

**Recommendation:** Implement the `TestAssignments` table as planned, using a gradual migration strategy to minimize disruption.

---

## Related Documents

- `ORGANIZATION_EXAM_ENROLLMENT_AND_TEST_ASSIGNMENT.md` - Original assignment requirements
- `Related_Documents/Database_Schema.md` - Complete database schema
- `backend/migrations/create_test_assignments_table.sql` - Migration script

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-18  
**Status:** Planning Phase
