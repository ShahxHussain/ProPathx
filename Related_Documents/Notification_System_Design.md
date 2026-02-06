# 🔔 Notification System Design Document

## Database Schema Analysis

### Existing Notifications Table

The database already has a `Notifications` table with the following structure:

```sql
CREATE TABLE "Notifications" (
  "NotificationID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "EntityType" notification_entity_enum,  -- ENUM('User','Organization','Student')
  "EntityID" uuid,                        -- References UserID, OrgID, or StudentID
  "Title" text,
  "Message" text,
  "NotificationType" notification_type_enum, -- ENUM('System','Payment','Exam','Result','Reminder','Alert')
  "IsRead" boolean DEFAULT FALSE,
  "CreatedAt" timestamptz DEFAULT now(),
  "ReadAt" timestamptz                    -- Nullable, set when notification is read
);
```

### ENUM Types

**EntityType:**
- `User` - Platform-level users (SuperAdmin, Reviewer, Subject Expert)
- `Organization` - Organization-level notifications (sent to all OrgUsers)
- `Student` - Student-specific notifications

**NotificationType:**
- `System` - System-wide notifications (maintenance, updates, etc.)
- `Payment` - Payment-related (success, failure, subscription expiry)
- `Exam` - Exam-related (new exam created, exam scheduled, exam starting soon)
- `Result` - Result-related (results published, certificate issued)
- `Reminder` - Reminders (test starting in X hours, payment due, etc.)
- `Alert` - Important alerts (account suspended, security alerts, etc.)

---

## How the Notification System Would Work

### 1. **Notification Creation Flow**

#### A. **Automatic Notifications (System-Generated)**

Notifications would be automatically created when certain events occur:

**For Students:**
- When a test is scheduled → `NotificationType: Exam`
- When test results are published → `NotificationType: Result`
- When certificate is issued → `NotificationType: Result`
- Test starting reminder (e.g., 1 hour before) → `NotificationType: Reminder`
- Payment due reminder → `NotificationType: Reminder`
- Subscription expiring soon → `NotificationType: Payment`

**For OrgAdmin:**
- When a new user is created in their organization → `NotificationType: System`
- When a question is approved/rejected → `NotificationType: System`
- When subscription is about to expire → `NotificationType: Payment`
- When payment is successful/failed → `NotificationType: Payment`
- When a test is completed by students → `NotificationType: Exam`

**For Subject Expert:**
- When their question is approved → `NotificationType: System`
- When their question is rejected → `NotificationType: Alert`
- When reviewer adds comments → `NotificationType: System`
- When new exam is created for their organization → `NotificationType: Exam`

**For Reviewer:**
- When new questions are submitted for review → `NotificationType: System`
- When questions need urgent review → `NotificationType: Alert`

**For SuperAdmin:**
- When new organization signs up → `NotificationType: System`
- When payment is received → `NotificationType: Payment`
- When system errors occur → `NotificationType: Alert`
- When subscription expires → `NotificationType: Payment`

#### B. **Manual Notifications (Admin-Created)**

SuperAdmin and OrgAdmin could manually create notifications:
- Broadcast messages to all users
- Organization-specific announcements
- Targeted notifications to specific users/students

---

### 2. **Notification Delivery Mechanisms**

#### A. **In-App Notifications**
- Real-time notifications displayed in the UI
- Notification bell icon with unread count badge
- Notification dropdown/list panel
- Mark as read functionality
- Filter by type (System, Payment, Exam, etc.)

#### B. **Email Notifications** (Future Enhancement)
- Send email for critical notifications
- Email preferences per user
- Digest emails (daily/weekly summary)

#### C. **Push Notifications** (Future Enhancement)
- Browser push notifications
- Mobile app push notifications (if mobile app is developed)

---

### 3. **Notification Retrieval & Display**

#### API Endpoints Needed:

**GET /api/notifications**
- Get all notifications for the logged-in user
- Query parameters:
  - `isRead` (optional): Filter by read/unread status
  - `type` (optional): Filter by NotificationType
  - `limit` (optional): Pagination limit
  - `offset` (optional): Pagination offset
- Returns notifications sorted by `CreatedAt` DESC (newest first)

**GET /api/notifications/unread-count**
- Get count of unread notifications
- Used for badge display

**PUT /api/notifications/:notificationId/read**
- Mark a notification as read
- Sets `IsRead = true` and `ReadAt = current timestamp`

**PUT /api/notifications/mark-all-read**
- Mark all notifications as read for the user

**DELETE /api/notifications/:notificationId**
- Delete a notification (optional feature)

---

### 4. **Notification Targeting Logic**

#### EntityType = 'User'
- `EntityID` = UserID from `Users` table
- For: SuperAdmin, Platform Reviewer, Platform Subject Expert
- Example: `EntityType: 'User', EntityID: <SuperAdmin UserID>`

#### EntityType = 'Organization'
- `EntityID` = OrgID from `Organizations` table
- Notification is sent to ALL active OrgUsers in that organization
- Query: Get all OrgUsers where `OrgID = EntityID` and `Status = 'Active'`
- Example: `EntityType: 'Organization', EntityID: <OrgID>` → All OrgAdmins, Reviewers, Subject Experts in that org receive it

#### EntityType = 'Student'
- `EntityID` = StudentID from `Students` table
- For: Individual student notifications
- Example: `EntityType: 'Student', EntityID: <StudentID>`

---

### 5. **Notification Creation Triggers**

#### Backend Service Functions:

**When Question is Approved:**
```javascript
// In question approval route
await createNotification({
  entityType: 'User', // or 'Organization' if org-level
  entityID: question.CreatedBy, // Subject Expert who created it
  title: 'Question Approved',
  message: `Your question "${question.QuestionText.substring(0, 50)}..." has been approved.`,
  notificationType: 'System'
});
```

**When Test is Scheduled:**
```javascript
// When OrgAdmin creates/schedules a test
// Get all students in the organization
const students = await getStudentsByOrg(orgId);

for (const student of students) {
  await createNotification({
    entityType: 'Student',
    entityID: student.StudentID,
    title: 'New Test Scheduled',
    message: `A new test "${test.TestName}" is scheduled for ${test.TestDate}.`,
    notificationType: 'Exam'
  });
}
```

**When Results are Published:**
```javascript
// After test completion and results are generated
await createNotification({
  entityType: 'Student',
  entityID: studentAttempt.StudentID,
  title: 'Test Results Available',
  message: `Your results for "${test.TestName}" are now available. You scored ${obtainedMarks}/${totalMarks}.`,
  notificationType: 'Result'
});
```

**When Payment is Successful:**
```javascript
// After payment completion
if (entityType === 'Organization') {
  await createNotification({
    entityType: 'Organization',
    entityID: payment.EntityID,
    title: 'Payment Successful',
    message: `Payment of $${amount} has been processed successfully.`,
    notificationType: 'Payment'
  });
}
```

**When Subscription Expires Soon:**
```javascript
// Scheduled job (cron) that runs daily
// Check subscriptions expiring in 7 days
const expiringSubscriptions = await getSubscriptionsExpiringInDays(7);

for (const subscription of expiringSubscriptions) {
  if (subscription.EntityType === 'Organization') {
    await createNotification({
      entityType: 'Organization',
      entityID: subscription.EntityID,
      title: 'Subscription Expiring Soon',
      message: `Your subscription will expire on ${subscription.EndDate}. Please renew to continue using the platform.`,
      notificationType: 'Reminder'
    });
  }
}
```

---

### 6. **Frontend Implementation**

#### A. **Notification Bell Component**
- Icon with badge showing unread count
- Click opens notification dropdown
- Real-time updates (polling or WebSocket)

#### B. **Notification Dropdown/Panel**
- List of notifications (newest first)
- Visual indicators:
  - Unread: Bold text, colored background
  - Read: Normal text, grayed out
- Icons based on NotificationType:
  - System: Info icon
  - Payment: Dollar icon
  - Exam: Book icon
  - Result: Award icon
  - Reminder: Clock icon
  - Alert: Alert triangle icon

#### C. **Notification Page** (Full View)
- Dedicated page showing all notifications
- Filters: All, Unread, By Type
- Pagination for large lists
- Mark all as read button
- Delete notifications (optional)

#### D. **Real-time Updates**
- Polling: Check for new notifications every 30 seconds
- WebSocket: Real-time push (future enhancement)
- Update badge count when new notifications arrive

---

### 7. **Database Queries**

#### Get Notifications for a User:

**For Platform User (SuperAdmin, Reviewer, Subject Expert):**
```sql
SELECT * FROM "Notifications"
WHERE "EntityType" = 'User' 
  AND "EntityID" = <UserID>
ORDER BY "CreatedAt" DESC
LIMIT 50;
```

**For Organization User (OrgAdmin, Reviewer, Subject Expert):**
```sql
-- Get user's organization
SELECT "OrgID" FROM "OrgUsers" WHERE "OrgUserID" = <OrgUserID>;

-- Get notifications for the user individually
SELECT * FROM "Notifications"
WHERE ("EntityType" = 'User' AND "EntityID" = <OrgUserID>)
   OR ("EntityType" = 'Organization' AND "EntityID" = <OrgID>)
ORDER BY "CreatedAt" DESC
LIMIT 50;
```

**For Student:**
```sql
SELECT * FROM "Notifications"
WHERE "EntityType" = 'Student' 
  AND "EntityID" = <StudentID>
ORDER BY "CreatedAt" DESC
LIMIT 50;
```

#### Get Unread Count:
```sql
SELECT COUNT(*) FROM "Notifications"
WHERE "EntityType" = <EntityType>
  AND "EntityID" = <EntityID>
  AND "IsRead" = FALSE;
```

---

### 8. **Notification Service Architecture**

#### Backend Service Layer:

```javascript
// services/notificationService.js

class NotificationService {
  // Create notification for single entity
  async createNotification(notificationData) {
    // Insert into Notifications table
  }

  // Create notification for all users in organization
  async createOrgNotification(orgId, notificationData) {
    // Get all active OrgUsers
    // Create notification for each user
  }

  // Create notification for all students in organization
  async createStudentNotifications(orgId, notificationData) {
    // Get all active students
    // Create notification for each student
  }

  // Get notifications for user
  async getUserNotifications(userId, entityType, filters) {
    // Query based on entity type and filters
  }

  // Mark as read
  async markAsRead(notificationId) {
    // Update IsRead and ReadAt
  }

  // Mark all as read
  async markAllAsRead(entityType, entityId) {
    // Bulk update
  }
}
```

---

### 9. **Integration Points**

#### Where Notifications Would Be Created:

1. **Question Approval/Rejection** (`backend/routes/reviewers.js`)
   - After approving/rejecting a question
   - Notify the Subject Expert who created it

2. **Test Creation** (`backend/routes/admin.js` or future test routes)
   - When SuperAdmin creates a test
   - Notify relevant Subject Experts

3. **Test Scheduling** (Future feature)
   - When OrgAdmin schedules a test
   - Notify all students in the organization

4. **Result Generation** (Future feature)
   - After test completion
   - Notify students when results are published

5. **Payment Processing** (`backend/routes/admin.js` or payment routes)
   - After successful payment
   - After failed payment
   - Subscription expiry warnings

6. **User Creation** (`backend/routes/users.js`, `backend/routes/admin.js`)
   - When OrgAdmin creates a user
   - When SuperAdmin creates platform user
   - Welcome notification

7. **Organization Creation** (`backend/routes/admin.js`)
   - Welcome notification to new OrgAdmin

8. **Scheduled Jobs** (Cron jobs)
   - Subscription expiry reminders
   - Test starting reminders
   - Payment due reminders

---

### 10. **Notification Preferences** (Future Enhancement)

Could add a `NotificationPreferences` table:

```sql
CREATE TABLE "NotificationPreferences" (
  "PreferenceID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "EntityType" notification_entity_enum,
  "EntityID" uuid,
  "NotificationType" notification_type_enum,
  "EmailEnabled" boolean DEFAULT true,
  "InAppEnabled" boolean DEFAULT true,
  "PushEnabled" boolean DEFAULT false
);
```

This would allow users to:
- Disable email notifications for certain types
- Enable/disable in-app notifications
- Control push notification preferences

---

### 11. **Notification Cleanup**

#### Retention Policy:
- Keep unread notifications indefinitely
- Auto-delete read notifications older than 90 days (optional)
- Archive old notifications to separate table (optional)

#### Scheduled Cleanup Job:
```javascript
// Cron job that runs weekly
async function cleanupOldNotifications() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  // Delete read notifications older than 90 days
  await supabase
    .from('Notifications')
    .delete()
    .eq('IsRead', true)
    .lt('ReadAt', ninetyDaysAgo.toISOString());
}
```

---

### 12. **UI/UX Considerations**

#### Notification Badge:
- Show unread count on bell icon
- Red badge with white number
- Animate when new notification arrives

#### Notification List:
- Group by date (Today, Yesterday, This Week, Older)
- Show relative time (e.g., "2 hours ago")
- Click notification → mark as read + navigate to related page
- Hover effects for better UX

#### Notification Types Visual:
- Color-coded by type:
  - System: Blue
  - Payment: Green
  - Exam: Purple
  - Result: Gold
  - Reminder: Orange
  - Alert: Red

#### Empty States:
- "No notifications" message when list is empty
- "All caught up!" when all notifications are read

---

### 13. **Performance Considerations**

#### Indexes Needed:
```sql
CREATE INDEX idx_notifications_entity ON "Notifications"("EntityType", "EntityID");
CREATE INDEX idx_notifications_read ON "Notifications"("EntityType", "EntityID", "IsRead");
CREATE INDEX idx_notifications_created ON "Notifications"("CreatedAt" DESC);
```

#### Caching:
- Cache unread count in Redis (optional)
- Cache recent notifications (last 10) in memory
- Invalidate cache when new notification is created

#### Pagination:
- Always use pagination for notification lists
- Default: 20 notifications per page
- Load more on scroll (infinite scroll)

---

### 14. **Security Considerations**

#### Access Control:
- Users can only see their own notifications
- OrgAdmin can see organization notifications
- SuperAdmin can see all notifications (if needed)

#### Validation:
- Validate EntityID exists and user has access
- Prevent notification spam (rate limiting)
- Sanitize notification content (XSS prevention)

---

## Summary

The notification system would work as follows:

1. **Creation**: Notifications are automatically created when events occur (question approved, test scheduled, payment received, etc.) or manually by admins.

2. **Storage**: All notifications are stored in the `Notifications` table with proper EntityType and EntityID mapping.

3. **Retrieval**: Users fetch their notifications via API endpoints, filtered by read status and type.

4. **Display**: Frontend shows notifications in a bell icon dropdown and dedicated notification page.

5. **Interaction**: Users can mark notifications as read, filter them, and navigate to related content.

6. **Real-time**: Polling or WebSocket keeps notifications updated in real-time.

The existing database schema is well-designed and supports all these features. The system would be scalable, maintainable, and provide a good user experience.

