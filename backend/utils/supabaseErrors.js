/**
 * Detect Supabase / network failures (DNS, offline, wrong URL).
 */
export function isSupabaseConnectivityError(error) {
  if (!error) return false;
  const text = `${error.message || ''} ${error.details || ''} ${error.code || ''}`.toLowerCase();
  return (
    text.includes('fetch failed') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('network') ||
    text.includes('socket')
  );
}

/**
 * True when PostgREST returned no row (not a network error).
 */
export function isSupabaseNotFoundError(error) {
  if (!error) return false;
  return error.code === 'PGRST116' || `${error.message || ''}`.toLowerCase().includes('0 rows');
}

let lastConnectivityLogAt = 0;

/** Log connectivity issues at most once per minute to avoid terminal spam. */
export function logConnectivityIssue(context, error) {
  const now = Date.now();
  if (now - lastConnectivityLogAt < 60_000) return;
  lastConnectivityLogAt = now;
  const hostHint = process.env.SUPABASE_URL
    ? ` (${new URL(process.env.SUPABASE_URL).hostname})`
    : '';
  console.error(
    `[Database] ${context}: cannot reach Supabase${hostHint}. Check SUPABASE_URL in backend/.env, your internet connection, and VPN/firewall.`,
    error?.message || error
  );
}

export function respondDatabaseUnavailable(res, error) {
  return res.status(503).json({
    error:
      'Cannot reach the database. Check your internet connection and Supabase settings in backend/.env, then restart the API server.',
    code: 'DATABASE_UNAVAILABLE',
    details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
  });
}
