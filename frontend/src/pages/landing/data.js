import {
  Activity,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Bot,
  Brain,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  List,
  Megaphone,
  Package,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  UsersRound,
} from 'lucide-react';

export const NAV_LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#roles', label: 'Roles' },
  { href: '#portals', label: 'Portals' },
  { href: '#roadmap', label: 'Roadmap' },
  { href: '#security', label: 'Security' },
];

export const METRICS = [
  { value: '10K+', label: 'Learning sessions delivered' },
  { value: '99.9%', label: 'Platform uptime' },
  { value: '5 portals', label: 'Role-built experiences' },
];

export const CHECKS = [
  'Course → Subject → Chapter → Topic syllabus hierarchy',
  'Practice paths, progress tracking & guided assignments',
  'Org subscriptions, usage counters & enrollments',
  'Audit logs, notifications & review pipeline',
];

export const PREVIEW_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Sparkles, label: 'Explore exams' },
  { icon: Package, label: 'Subscription plans' },
  { icon: Users, label: 'Users' },
  { icon: GraduationCap, label: 'Students' },
  { icon: BookMarked, label: 'Exam enrollments' },
  { icon: UsersRound, label: 'Groups' },
  { icon: FileText, label: 'Tests' },
  { icon: BookOpenCheck, label: 'Questions in Tests' },
  { icon: BookOpen, label: 'Question Bank' },
  { icon: List, label: 'Assigned Tests' },
  { icon: Bell, label: 'Notifications' },
  { icon: ScrollText, label: 'System Logs' },
  { icon: Megaphone, label: 'Create Notification' },
  { icon: Settings, label: 'Settings' },
];

export const PREVIEW_STATS = [
  { label: 'Students', value: '248', delta: '+18%', icon: GraduationCap },
  { label: 'Active tests', value: '36', delta: '12 scheduled', icon: FileText },
  { label: 'Avg. score', value: '84%', delta: '+3.2%', icon: TrendingUp },
  { label: 'Attempts', value: '1.2k', delta: 'This month', icon: Activity },
];

export const PREVIEW_CHART = [42, 58, 48, 72, 65, 88, 76, 94, 82, 91, 86, 97];

export const PREVIEW_ACTIVITY = [
  { time: '2m ago', text: 'Cardiology Module test assigned to 24 students' },
  { time: '18m ago', text: 'Anatomy question approved by reviewer' },
  { time: '1h ago', text: 'New enrollment batch — 12 students added' },
];

export const PLATFORM_TABS = [
  {
    id: 'content',
    label: 'Content pipeline',
    icon: Layers,
    title: 'Structured exam content at every level',
    desc: 'Platform exams roll up into subjects, optional chapters, and topics — the same chain that powers analytics, filtering, and future adaptive targeting.',
    nodes: ['Exams', 'Subjects', 'Chapters', 'Topics', 'Questions', 'Tests'],
    highlights: [
      'Question → Topic → Chapter chain for analytics',
      'Reviewer verification & AI/Self/PastExam sources',
      'Org and platform question banks with media support',
    ],
    panel: {
      type: 'hierarchy',
      items: [
        { level: 'Exam', name: 'MDCAT', count: '4 subjects' },
        { level: 'Subject', name: 'Biology', count: '12 chapters' },
        { level: 'Chapter', name: 'Cell Biology', count: '8 topics' },
        { level: 'Topic', name: 'Mitosis & Meiosis', count: '142 questions' },
      ],
    },
  },
  {
    id: 'assessment',
    label: 'Assessments',
    icon: ClipboardCheck,
    title: 'Practice, mock & final — your way',
    desc: 'Create tests with custom, auto, or hybrid question binding. Schedule windows or keep tests open. Assign to individuals, groups, or entire cohorts.',
    nodes: ['Practice', 'Mock', 'Final', 'Assignments', 'Attempts', 'Results'],
    highlights: [
      'Scheduled vs open-window delivery modes',
      'Test assignments with due dates & group targeting',
      'Subject/topic result breakdowns & leaderboards',
    ],
    panel: {
      type: 'test-flow',
      steps: [
        { label: 'Create test', status: 'done' },
        { label: 'Bind questions', status: 'done' },
        { label: 'Assign cohort', status: 'active' },
        { label: 'Live attempts', status: 'pending' },
        { label: 'Analytics', status: 'pending' },
      ],
    },
  },
  {
    id: 'subscription',
    label: 'Subscriptions',
    icon: CreditCard,
    title: 'Plans, entitlements & usage at scale',
    desc: 'Subscription plans gate exams, test modes, and AI features. Usage counters track students enrolled, tests created, and attempts — per exam, per month.',
    nodes: ['Plans', 'Subscriptions', 'Enrollments', 'Usage', 'Payments'],
    highlights: [
      'Org & individual student plan audiences',
      'StudentExamEnrollments with approval workflows',
      'Per-exam limits: students, tests, questions, AI quota',
    ],
    panel: {
      type: 'usage',
      rows: [
        { label: 'Students enrolled', used: 248, max: 500 },
        { label: 'Tests created', used: 36, max: 120 },
        { label: 'AI questions', used: 840, max: 2000 },
      ],
    },
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: Shield,
    title: 'Audit-ready multi-tenant control',
    desc: 'Every action leaves a trace. Role-based portals, maintenance controls, notifications, and comprehensive logs keep institutions compliant and informed.',
    nodes: ['Roles', 'Logs', 'Notifications', 'Certificates', 'Feedback'],
    highlights: [
      'Actor + entity audit trail with before/after JSON',
      'Targeted notifications by role or organization',
      'Certificates, feedback & maintenance mode controls',
    ],
    panel: {
      type: 'audit',
      events: [
        { actor: 'OrgAdmin', action: 'Assigned test', time: '09:14' },
        { actor: 'Reviewer', action: 'Verified question', time: '09:02' },
        { actor: 'Student', action: 'Completed attempt', time: '08:47' },
        { actor: 'System', action: 'Usage counter sync', time: '08:30' },
      ],
    },
  },
];

export const ROLE_STEPS = [
  {
    id: 'layers',
    tabLabel: 'Two layers',
    icon: Layers,
    color: 'navy',
    layer: 'overview',
    layerLabel: 'Architecture',
    title: 'Platform layer + organization layer',
    desc: 'ProPath is multi-tenant by design. A platform layer (Users) runs global exams, plans, and governance. Each organization gets its own admins, staff, and enrolled students — isolated, but on the same engine.',
    features: [
      'Platform Users — SuperAdmin, Reviewer, Subject Expert, Support, AI',
      'OrgUsers — OrgAdmin, Reviewer, Subject Expert scoped to your institute',
      'Students — org-enrolled (OrgID set) or individual self-registered learners',
    ],
    panel: { type: 'layers' },
  },
  {
    id: 'superadmin',
    tabLabel: 'Super Admin',
    icon: Shield,
    color: 'crimson',
    layer: 'platform',
    layerLabel: 'Platform layer',
    title: 'Super Admin — global platform control',
    desc: 'Owns the full system: organizations, subscription plans, exam hierarchies, maintenance, AI configuration, and cross-tenant audit. The only role with unrestricted platform scope.',
    features: [
      'Approve & manage organizations and platform Users',
      'Define subscription plans, exam catalogs & system settings',
      'Global analytics, logs, impersonation support & health monitoring',
    ],
    panel: { type: 'portal', name: 'Super Admin', scope: 'Global / all tenants', table: 'Users' },
  },
  {
    id: 'platform-staff',
    tabLabel: 'Platform staff',
    icon: BookOpen,
    color: 'violet',
    layer: 'platform',
    layerLabel: 'Platform layer',
    title: 'Our platform experts & reviewers',
    desc: 'ProPath\'s own Subject Experts and Reviewers (Users table) build and verify the global question bank — shared exam content that organizations can subscribe to and extend.',
    features: [
      'Platform Subject Experts — author MCQs for global exams & topics',
      'Platform Reviewers — verify difficulty, correctness & metadata',
      'Collaborate with AI generation; contributions tracked in audit logs',
    ],
    panel: {
      type: 'dual-role',
      scope: 'Platform Users',
      roles: [
        { name: 'Subject Expert', duty: 'Global question authoring' },
        { name: 'Reviewer', duty: 'Platform-wide verification' },
      ],
    },
  },
  {
    id: 'orgadmin',
    tabLabel: 'Org Admin',
    icon: Building2,
    color: 'navy',
    layer: 'organization',
    layerLabel: 'Organization layer',
    title: 'Org Admin — your institute\'s control center',
    desc: 'Each organization\'s administrator manages OrgUsers, students, groups, exam enrollments, tests, subscriptions, and notifications — all within tenant boundaries.',
    features: [
      'Enroll students, manage groups & StudentExamEnrollments',
      'Create tests, assignments, and org notifications',
      'View usage counters, payments & performance analytics',
    ],
    panel: { type: 'portal', name: 'Org Admin', scope: 'Your organization', table: 'OrgUsers' },
  },
  {
    id: 'org-staff',
    tabLabel: 'Your staff',
    icon: ClipboardCheck,
    color: 'teal',
    layer: 'organization',
    layerLabel: 'Organization layer',
    title: 'Your experts & reviewers',
    desc: 'Your institute\'s Subject Experts and Reviewers (OrgUsers) create org-scoped questions, run internal review workflows, and maintain quality for your own tests and question bank.',
    features: [
      'Your Subject Experts — org-level MCQs tagged by topic & difficulty',
      'Your Reviewers — approve or reject before tests go live',
      'Separate from platform staff; permissions limited to your OrgID',
    ],
    panel: {
      type: 'dual-role',
      scope: 'OrgUsers',
      roles: [
        { name: 'Subject Expert', duty: 'Your org question pools' },
        { name: 'Reviewer', duty: 'Your org verification queue' },
      ],
    },
  },
  {
    id: 'students',
    tabLabel: 'Students',
    icon: GraduationCap,
    color: 'student',
    layer: 'learners',
    layerLabel: 'Learner layer',
    title: 'Organization students & individual learners',
    desc: 'Students share one portal experience but two enrollment models: org-enrolled students (OrgID set, assignments & enrollments) and individual learners (self-registered, personal subscription & self-tests).',
    features: [
      'Org students — assigned tests, groups, org analytics & certificates',
      'Individual students — personal plans, self-test builder & explore exams',
      'Both — attempts, topic-level results, explanations & notifications',
    ],
    panel: {
      type: 'student-types',
      types: [
        {
          name: 'Organization student',
          detail: 'OrgID set · enrollments & assignments',
          color: 'navy',
        },
        {
          name: 'Individual student',
          detail: 'Self-registered · personal subscription',
          color: 'student',
        },
      ],
    },
  },
];

export const ROADMAP_ITEMS = [
  {
    id: 'adaptive',
    badge: 'Coming soon',
    icon: Brain,
    title: 'Adaptive learning engine',
    tagline: 'Personalized practice paths from your existing syllabus',
    desc: 'Rule-based adaptation across accuracy, difficulty handling, and pace — scoped by SuperAdmin guardrails and OrgAdmin policy. Topic-first targeting with optional chapter remediation.',
    features: [
      'Topic, chapter, or combined targeting modes',
      'Mastery profiles with cold-start calibration',
      'Separate adaptive track from scheduled exams',
    ],
    preview: {
      type: 'adaptive',
      mastery: [
        { topic: 'Cell Biology', score: 82, trend: '+12%' },
        { topic: 'Organic Chemistry', score: 54, trend: 'Focus' },
        { topic: 'Mechanics', score: 71, trend: '+5%' },
      ],
      next: 'Next: 3 Medium questions on Organic Chemistry',
    },
  },
  {
    id: 'rag',
    badge: 'Coming soon',
    icon: Sparkles,
    title: 'AI RAG MCQ generation',
    tagline: 'Generate verified-style questions from your context',
    desc: 'Upload syllabus notes, past papers, or institutional material. RAG retrieves relevant context and drafts MCQs with explanations — routed through your review pipeline before delivery.',
    features: [
      'Context-grounded generation (not hallucinated trivia)',
      'Difficulty, type & topic tagging on create',
      'Expert review + audit log for AIQuestionGeneration',
    ],
    preview: {
      type: 'rag',
      source: 'Chapter 4 — Enzyme Kinetics (uploaded PDF)',
      output: {
        question: 'Which factor does NOT affect enzyme reaction rate at constant substrate?',
        options: ['Temperature', 'pH', 'Catalyst surface area', 'Enzyme concentration'],
        difficulty: 'Medium',
      },
    },
  },
  {
    id: 'assistant',
    badge: 'Coming soon',
    icon: Bot,
    title: 'AI study assistant',
    tagline: 'Guidance at every step of the student journey',
    desc: 'An embedded assistant helps students understand wrong answers, plan revision, and navigate tests — without replacing the integrity of formal scheduled assessments.',
    features: [
      'Explain-this-answer after attempts',
      'Revision prompts from weak topic signals',
      'Step-aware help during practice (not finals)',
    ],
    preview: {
      type: 'assistant',
      messages: [
        { role: 'student', text: 'Why was option C wrong on the mitosis question?' },
        { role: 'ai', text: 'Option C describes cytokinesis, which follows mitosis. The question asked specifically about chromosome separation — that\'s anaphase (option B).' },
        { role: 'ai', text: 'Want a 5-question recap on cell division?' },
      ],
    },
  },
];

export const PORTALS = [
  {
    id: 'org',
    tabLabel: 'Organization',
    icon: Building2,
    color: 'navy',
    title: 'Organizations & staff',
    desc: 'Org admins manage learners, groups, enrollments, practice paths, subscriptions, and notifications. Reviewers and subject experts collaborate on verified content.',
    features: [
      'Student groups & test assignments',
      'Enrollment approval workflows',
      'Question bank & usage dashboards',
    ],
    asideLabel: 'Includes',
    asideItems: ['Org Admin', 'Reviewer', 'Subject Expert'],
    loginType: 'org',
    cta: 'Organization sign in',
  },
  {
    id: 'student',
    tabLabel: 'Student',
    icon: GraduationCap,
    color: 'student',
    title: 'Students',
    desc: 'Org-enrolled or independent — follow assigned practice, review explanations, track topic-level mastery, and build self-study when your plan allows.',
    features: [
      'Practice, mock & final attempts',
      'Result details by subject & topic',
      'Notifications, feedback & certificates',
    ],
    asideLabel: 'For',
    asideItems: ['Org-enrolled students', 'Individual learners'],
    loginType: 'student',
    cta: 'Student sign in',
  },
];

export const PILLARS = [
  {
    icon: Layers,
    title: 'Structured learning content',
    desc: 'Courses, subjects, chapters, topics, and practice items — one hierarchy for teaching, analytics, and adaptive paths.',
  },
  {
    icon: Users,
    title: 'Role-aware learning workspaces',
    desc: 'Super Admin, Org Admin, Reviewer, Subject Expert, and Student portals — each tuned to how that role supports learners.',
  },
  {
    icon: BarChart3,
    title: 'Insight that drives progress',
    desc: 'Dashboards, enrollments, usage counters, and mastery analytics so teams coach from evidence, not guesswork.',
  },
];
