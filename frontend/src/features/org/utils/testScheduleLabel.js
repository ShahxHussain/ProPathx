/** Schedule delivery label for org-created tests (replaces legacy TestType). */
export function getTestScheduleMode(test) {
  const mode = test?.ScheduleMode ?? test?.scheduleMode;
  return mode === 'scheduled' ? 'scheduled' : 'open';
}

export function getTestScheduleLabel(test) {
  return getTestScheduleMode(test) === 'scheduled' ? 'Scheduled' : 'Open';
}

export function getTestScheduleBadgeColor(test) {
  return getTestScheduleMode(test) === 'scheduled' ? 'orange' : 'blue';
}
