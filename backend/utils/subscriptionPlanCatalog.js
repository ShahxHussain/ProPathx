/**
 * Subscription plan audience filtering (SubscriptionPlans.Audience):
 * - Organization, Student, Both
 * Legacy rows with null/undefined Audience are treated as Organization-only.
 */

export function filterPlansForOrganizationAudience(plans) {
  return (plans || []).filter((p) => {
    const a = p.Audience ?? 'Organization';
    return a === 'Organization' || a === 'Both';
  });
}

/** Student-facing (including individual / platform students): Student + Both */
export function filterPlansForStudentAudience(plans) {
  return (plans || []).filter((p) => {
    const a = p.Audience ?? 'Organization';
    return a === 'Student' || a === 'Both';
  });
}

/**
 * Count verified platform questions (OrgID null) per exam — same pool rules as individual self-test.
 */
export async function getVerifiedPlatformQuestionCountsByExamIds(supabase, examIds) {
  const counts = new Map();
  const unique = [...new Set((examIds || []).filter(Boolean))];
  for (const id of unique) counts.set(id, 0);
  if (unique.length === 0) return counts;

  const { data: subjects, error: subjErr } = await supabase
    .from('Subjects')
    .select('SubjectID, ExamID')
    .in('ExamID', unique);
  if (subjErr) {
    console.error('getVerifiedPlatformQuestionCountsByExamIds subjects:', subjErr);
    return counts;
  }

  const subjectIds = (subjects || []).map((s) => s.SubjectID).filter(Boolean);
  const examBySubject = new Map((subjects || []).map((s) => [s.SubjectID, s.ExamID]));

  if (subjectIds.length === 0) return counts;

  const { data: topics, error: topicErr } = await supabase
    .from('Topics')
    .select('TopicID, SubjectID')
    .in('SubjectID', subjectIds);
  if (topicErr) {
    console.error('getVerifiedPlatformQuestionCountsByExamIds topics:', topicErr);
    return counts;
  }

  const topicIds = (topics || []).map((t) => t.TopicID).filter(Boolean);
  const subjectByTopic = new Map((topics || []).map((t) => [t.TopicID, t.SubjectID]));
  if (topicIds.length === 0) return counts;

  const { data: questions, error: qErr } = await supabase
    .from('Questions')
    .select('QuestionID, TopicID')
    .eq('IsVerified', true)
    .is('OrgID', null)
    .in('TopicID', topicIds);
  if (qErr) {
    console.error('getVerifiedPlatformQuestionCountsByExamIds questions:', qErr);
    return counts;
  }

  for (const q of questions || []) {
    const sid = subjectByTopic.get(q.TopicID);
    if (!sid) continue;
    const eid = examBySubject.get(sid);
    if (!eid) continue;
    counts.set(eid, (counts.get(eid) || 0) + 1);
  }
  return counts;
}

function defaultTestModes() {
  return {
    isScheduledEnabled: false,
    isAdaptiveEnabled: false,
    isSelfTestBuilderEnabled: false,
  };
}

export function normalizePlanTestModes(row) {
  return {
    isScheduledEnabled: !!(row?.IsScheduledEnabled ?? row?.isScheduledEnabled),
    isAdaptiveEnabled: !!(row?.IsAdaptiveEnabled ?? row?.isAdaptiveEnabled),
    isSelfTestBuilderEnabled: !!(row?.IsSelfTestBuilderEnabled ?? row?.isSelfTestBuilderEnabled),
  };
}

export async function getPlanTestModesMap(supabase, planIds) {
  const uniquePlanIds = [...new Set((planIds || []).filter(Boolean))];
  const out = new Map();
  for (const pid of uniquePlanIds) out.set(pid, defaultTestModes());
  if (!uniquePlanIds.length) return out;

  const { data, error } = await supabase
    .from('SubscriptionPlanTestModes')
    .select('PlanID, IsScheduledEnabled, IsAdaptiveEnabled, IsSelfTestBuilderEnabled')
    .in('PlanID', uniquePlanIds);
  if (error) {
    console.error('getPlanTestModesMap:', error);
    return out;
  }

  for (const row of data || []) {
    if (!row?.PlanID) continue;
    out.set(row.PlanID, normalizePlanTestModes(row));
  }
  return out;
}

export async function isPlanModeEnabled(supabase, planId, modeKey) {
  if (!planId || !modeKey) return false;
  const { data, error } = await supabase
    .from('SubscriptionPlanTestModes')
    .select('IsScheduledEnabled, IsAdaptiveEnabled, IsSelfTestBuilderEnabled')
    .eq('PlanID', planId)
    .single();
  if (error || !data) return false;
  const modes = normalizePlanTestModes(data);
  return !!modes[modeKey];
}

/**
 * Attach linked exams (from SubscriptionPlanExams + Exams) to each plan.
 */
export async function enrichPlansWithExams(supabase, plans) {
  if (!plans?.length) return [];

  const withExams = await Promise.all(
    plans.map(async (plan) => {
      const { data: planExams, error: planExamsError } = await supabase
        .from('SubscriptionPlanExams')
        .select('*')
        .eq('PlanID', plan.PlanID);

      if (planExamsError) {
        console.error(`Error fetching exams for plan ${plan.PlanID}:`, planExamsError);
        return { ...plan, exams: [] };
      }

      if (!planExams || planExams.length === 0) {
        return { ...plan, exams: [] };
      }

      const examIds = planExams.map((pe) => pe.ExamID).filter(Boolean);
      const { data: exams, error: examsError } = await supabase
        .from('Exams')
        .select('ExamID, ExamName, Description')
        .in('ExamID', examIds);

      if (examsError) {
        console.error(`Error fetching exam details for plan ${plan.PlanID}:`, examsError);
        return { ...plan, exams: [] };
      }

      const examMap = new Map((exams || []).map((e) => [e.ExamID, e]));

      const examsWithDetails = planExams.map((pe) => {
        const exam = examMap.get(pe.ExamID);
        return {
          ExamID: pe.ExamID,
          ExamName: exam?.ExamName || 'Unknown Exam',
          ExamDescription: exam?.Description || null,
          IsMandatory: pe.IsMandatory || false,
          MaxStudents: pe.MaxStudents,
          MaxTests: pe.MaxTests,
          MaxQuestionsPerTest: pe.MaxQuestionsPerTest,
          MaxTestsPerDay: pe.MaxTestsPerDay,
          AISupport: pe.AISupport || false,
        };
      });

      return {
        ...plan,
        exams: examsWithDetails,
      };
    })
  );

  const allExamIds = [...new Set(withExams.flatMap((p) => (p.exams || []).map((e) => e.ExamID).filter(Boolean)))];
  const poolCounts = await getVerifiedPlatformQuestionCountsByExamIds(supabase, allExamIds);

  const modeMap = await getPlanTestModesMap(
    supabase,
    withExams.map((p) => p.PlanID).filter(Boolean)
  );

  return withExams.map((plan) => {
    const exams = (plan.exams || []).map((e) => ({
      ...e,
      VerifiedPlatformQuestionCount: poolCounts.get(e.ExamID) ?? 0,
    }));
    const VerifiedPlatformQuestionPoolTotal = exams.reduce(
      (sum, e) => sum + (Number(e.VerifiedPlatformQuestionCount) || 0),
      0
    );
    return {
      ...plan,
      exams,
      VerifiedPlatformQuestionPoolTotal,
      testModes: modeMap.get(plan.PlanID) || defaultTestModes(),
    };
  });
}
