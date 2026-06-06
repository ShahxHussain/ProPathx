/** Desktop brand panel copy — keyed by auth flow. */
export const AUTH_BRAND_CONTENT = {
  portal: {
    title: 'Learning Intelligence Platform',
    copy: 'Adaptive practice, role-based workflows, and progress analytics in one secure experience.',
    highlight: 'Choose the portal that matches your role.',
    points: [
      'Organizations run programs with staff workspaces and governance.',
      'Students practice, track progress, and grow with structured paths.',
      'One platform — tenant-safe, audit-ready, built to scale.',
    ],
    grid: [
      { label: 'Organizations', detail: 'Admins, reviewers & subject experts' },
      { label: 'Students', detail: 'Org-enrolled & independent learners' },
      { label: 'Secure', detail: 'Role-based access & audit trails' },
      { label: 'Insightful', detail: 'Dashboards, mastery & usage analytics' },
    ],
    foot: ['Multi-tenant', 'Role-aware portals', 'Performance analytics'],
  },
  orgSignin: {
    title: 'Organization & staff sign in',
    copy: 'Access your institute workspace — manage learners, content, tests, and enrollments from one place.',
    highlight: 'Welcome back to your program command center.',
    points: [
      'Org Admin — staff, students, groups, and subscription usage.',
      'Reviewer & Subject Expert — question banks and verification workflows.',
      'Platform users — Super Admin, Support, and global staff roles.',
    ],
    grid: [
      { label: 'Enrollments', detail: 'Approve requests & manage cohorts' },
      { label: 'Tests', detail: 'Assignments, schedules & results' },
      { label: 'Question bank', detail: 'Org-scoped MCQs & review pipeline' },
      { label: 'Analytics', detail: 'Usage counters & performance trends' },
    ],
    foot: ['Tenant-isolated', 'Audit logs', 'Staff workspaces'],
  },
  orgSignup: {
    title: 'Register your organization',
    copy: 'Create your institute on ProPath — set up staff roles, enroll students, and launch structured learning programs.',
    highlight: 'Get your organization live in minutes.',
    points: [
      'Org Admin account with full institute control from day one.',
      'Invite reviewers and subject experts to build your question bank.',
      'Subscribe to exams, plans, and platform capabilities that fit your program.',
    ],
    grid: [
      { label: 'Onboard', detail: 'Org profile & admin account' },
      { label: 'Staff', detail: 'Add experts & reviewers' },
      { label: 'Students', detail: 'Enroll individuals or cohorts' },
      { label: 'Programs', detail: 'Exams, tests & practice paths' },
    ],
    foot: ['Free to start', 'Scalable plans', 'Enterprise-ready'],
  },
  studentSignin: {
    title: 'Student sign in',
    copy: 'Continue practice, assigned tests, and topic-level progress — whether you are org-enrolled or learning independently.',
    highlight: 'Pick up right where you left off.',
    points: [
      'Org students — view assignments, due dates, and institute analytics.',
      'Individual learners — personal plans, self-test builder, and explore exams.',
      'Topic breakdowns, explanations, and certificates when you earn them.',
    ],
    grid: [
      { label: 'Practice', detail: 'Assigned & self-directed tests' },
      { label: 'Progress', detail: 'Topic mastery & attempt history' },
      { label: 'Results', detail: 'Scores, explanations & feedback' },
      { label: 'Notifications', detail: 'Assignments & program updates' },
    ],
    foot: ['Your pace', 'Structured syllabus', 'Secure access'],
  },
  studentSignup: {
    title: 'Create your student account',
    copy: 'Join as an independent learner or get ready to connect with your institute — structured exams, practice, and progress tracking from day one.',
    highlight: 'Start learning with a path built for you.',
    points: [
      'Self-register for personal plans and explore available exams.',
      'Org-enrolled students can link to their institute after signup.',
      'Practice modes, topic results, and adaptive paths as your program allows.',
    ],
    grid: [
      { label: 'Sign up', detail: 'Quick student profile setup' },
      { label: 'Plans', detail: 'Individual subscription options' },
      { label: 'Practice', detail: 'Tests & self-study tools' },
      { label: 'Grow', detail: 'Mastery signals & recommendations' },
    ],
    foot: ['Independent learners', 'Org-ready', 'Progress tracking'],
  },
};

export function getAuthBrandKey(loginType, mode) {
  if (!loginType) return 'portal';
  if (loginType === 'student') {
    return mode === 'signup' ? 'studentSignup' : 'studentSignin';
  }
  return mode === 'signup' ? 'orgSignup' : 'orgSignin';
}

export function getAuthBrandContent(loginType, mode) {
  return AUTH_BRAND_CONTENT[getAuthBrandKey(loginType, mode)];
}
