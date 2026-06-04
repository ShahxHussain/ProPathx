import { supabase } from '../config/database.js';

/**
 * Latest successful login from audit logs (when OrgUsers.LastLogin was never persisted).
 */
export async function fetchLastLoginFromLogs(actorType, actorId) {
  if (!actorType || !actorId) return null;

  const { data, error } = await supabase
    .from('Logs')
    .select('Timestamp')
    .eq('ActorType', actorType)
    .eq('ActorID', actorId)
    .eq('ActionType', 'Login')
    .order('Timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.Timestamp) return null;
  return data.Timestamp;
}

/** Most recent audit log entry for the actor (fallback when Login rows were not recorded). */
export async function fetchLastActivityFromLogs(actorType, actorId) {
  if (!actorType || !actorId) return null;

  const { data, error } = await supabase
    .from('Logs')
    .select('Timestamp')
    .eq('ActorType', actorType)
    .eq('ActorID', actorId)
    .order('Timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.Timestamp) return null;
  return data.Timestamp;
}

/**
 * Resolve last login for an org user: DB column first, then audit logs; optionally backfill DB.
 */
export async function resolveOrgUserLastLogin(orgUserId, dbLastLogin, { backfill = true } = {}) {
  if (dbLastLogin) return dbLastLogin;

  let fromLogs = await fetchLastLoginFromLogs('OrgUser', orgUserId);
  if (!fromLogs) {
    fromLogs = await fetchLastActivityFromLogs('OrgUser', orgUserId);
  }
  if (!fromLogs) return null;

  if (backfill) {
    const { error } = await supabase
      .from('OrgUsers')
      .update({ LastLogin: fromLogs })
      .eq('OrgUserID', orgUserId);

    if (error && !error.message?.includes('LastLogin')) {
      console.warn('LastLogin backfill failed:', error.message);
    }
  }

  return fromLogs;
}

export async function recordOrgUserLastLogin(orgUserId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('OrgUsers')
    .update({ LastLogin: now })
    .eq('OrgUserID', orgUserId);

  if (error) {
    console.warn('Failed to record OrgUser LastLogin:', error.message);
    return { ok: false, at: null, error };
  }
  return { ok: true, at: now, error: null };
}
