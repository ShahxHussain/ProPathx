export function percentile(values, p) {
  const nums = values
    .filter((v) => v != null && !Number.isNaN(Number(v)))
    .map(Number)
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil((p / 100) * nums.length) - 1));
  return Math.round(nums[idx]);
}

export function sumRequestBuckets(series) {
  return (series || []).reduce(
    (acc, row) => ({
      ok: acc.ok + (row.ok || 0),
      clientError: acc.clientError + (row.clientError || 0),
      serverError: acc.serverError + (row.serverError || 0),
    }),
    { ok: 0, clientError: 0, serverError: 0 }
  );
}
