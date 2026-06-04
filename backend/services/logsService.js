import { supabase } from '../config/database.js';

export async function enrichLogsWithActorNames(logs) {
  return Promise.all(
    (logs || []).map(async (log) => {
      let actorName = 'Unknown';
      let actorEmail = null;

      try {
        if (log.ActorType === 'User') {
          const { data: user } = await supabase
            .from('Users')
            .select('FullName, Email')
            .eq('UserID', log.ActorID)
            .single();
          if (user) {
            actorName = user.FullName || 'Unknown User';
            actorEmail = user.Email;
          }
        } else if (log.ActorType === 'OrgUser') {
          const { data: orgUser } = await supabase
            .from('OrgUsers')
            .select('FullName, Email')
            .eq('OrgUserID', log.ActorID)
            .single();
          if (orgUser) {
            actorName = orgUser.FullName || 'Unknown Org User';
            actorEmail = orgUser.Email;
          }
        } else if (log.ActorType === 'Organization') {
          const { data: org } = await supabase
            .from('Organizations')
            .select('OrgName, OrgEmail')
            .eq('OrgID', log.ActorID)
            .single();
          if (org) {
            actorName = org.OrgName || 'Unknown Organization';
            actorEmail = org.OrgEmail;
          }
        } else if (log.ActorType === 'Student') {
          const { data: student } = await supabase
            .from('Students')
            .select('FullName, Email')
            .eq('StudentID', log.ActorID)
            .single();
          if (student) {
            actorName = student.FullName || 'Unknown Student';
            actorEmail = student.Email;
          }
        }
      } catch (err) {
        console.error('Error enriching log:', err);
      }

      return {
        ...log,
        ActorName: actorName,
        ActorEmail: actorEmail,
      };
    })
  );
}

/**
 * Paginated audit logs with optional filters (SuperAdmin).
 */
export async function listLogs({
  startDate,
  endDate,
  actorType,
  actionType,
  entityType,
  page = 1,
  limit = 50,
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  let query = supabase
    .from('Logs')
    .select('*', { count: 'exact' })
    .order('Timestamp', { ascending: false });

  if (startDate) {
    query = query.gte('Timestamp', new Date(startDate).toISOString());
  }
  if (endDate) {
    const endDateObj = new Date(endDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    query = query.lt('Timestamp', endDateObj.toISOString());
  }
  if (actorType) {
    query = query.eq('ActorType', actorType);
  }
  if (actionType) {
    query = query.eq('ActionType', actionType);
  }
  if (entityType) {
    query = query.eq('EntityType', entityType);
  }

  query = query.range(offset, offset + limitNum - 1);

  const { data: logs, error, count } = await query;

  if (error) {
    const err = new Error(error.message || 'Failed to fetch logs');
    err.status = 500;
    err.details = error.message;
    throw err;
  }

  const enrichedLogs = await enrichLogsWithActorNames(logs);

  return {
    logs: enrichedLogs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limitNum),
    },
  };
}

/** Aggregate log counts by actor/action/entity type. */
export async function getLogStats({ startDate, endDate }) {
  let query = supabase.from('Logs').select('ActorType, ActionType, EntityType', { count: 'exact' });

  if (startDate) {
    query = query.gte('Timestamp', new Date(startDate).toISOString());
  }
  if (endDate) {
    const endDateObj = new Date(endDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    query = query.lt('Timestamp', endDateObj.toISOString());
  }

  const { data: logs, count, error } = await query;

  if (error) {
    const err = new Error(error.message || 'Failed to fetch log stats');
    err.status = 500;
    err.details = error.message;
    throw err;
  }

  const stats = {
    total: count || 0,
    byActorType: {},
    byActionType: {},
    byEntityType: {},
  };

  (logs || []).forEach((log) => {
    stats.byActorType[log.ActorType] = (stats.byActorType[log.ActorType] || 0) + 1;
    stats.byActionType[log.ActionType] = (stats.byActionType[log.ActionType] || 0) + 1;
    stats.byEntityType[log.EntityType] = (stats.byEntityType[log.EntityType] || 0) + 1;
  });

  return { stats };
}
