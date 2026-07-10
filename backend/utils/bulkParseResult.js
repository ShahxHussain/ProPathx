const FILE_LEVEL_CODES = new Set([
  'EMPTY_FILE',
  'OUTLINE_FILE',
  'PARSE_ERROR',
  'NO_QUESTIONS',
  'ROW_LIMIT',
]);

/**
 * Build a parse summary for bulk upload preview.
 */
export function buildBulkParseSummary(rows = [], errors = [], meta = {}) {
  const rowErrors = errors.filter(
    (e) => !FILE_LEVEL_CODES.has(e.code) && e.code !== 'SKIPPED'
  );
  const fileErrors = errors.filter((e) => FILE_LEVEL_CODES.has(e.code));
  const validCount = rows.length;
  const errorCount = rowErrors.length;
  const totalFound = meta.totalFound ?? validCount + errorCount;
  const skippedCount = meta.skippedCount ?? 0;

  const failedIndexes = [...new Set(rowErrors.map((e) => e.index).filter((n) => n > 0))].sort(
    (a, b) => a - b
  );

  let status = 'empty';
  if (fileErrors.length) {
    status = 'file_error';
  } else if (validCount > 0 && errorCount > 0) {
    status = 'partial';
  } else if (validCount > 0) {
    status = 'ready';
  } else if (errorCount > 0) {
    status = 'all_invalid';
  }

  const headlineByStatus = {
    empty: 'No questions were found in this file.',
    file_error: fileErrors[0]?.message || 'This file could not be processed.',
    partial: `${validCount} of ${totalFound} question(s) are ready to import.`,
    ready: `${validCount} question(s) are ready to import.`,
    all_invalid: `All ${errorCount} question(s) need fixes before import.`,
  };

  const detailByStatus = {
    empty: 'Check that the file uses the ProPath question template format.',
    file_error: 'Fix the file-level issue below, then upload again.',
    partial:
      failedIndexes.length > 0
        ? `Question(s) ${formatIndexList(failedIndexes)} will be skipped. You can import the valid ones now and fix the rest in your file later.`
        : 'Some questions need fixes. Valid questions can still be imported.',
    ready: 'Review the preview below, then save or submit.',
    all_invalid: 'Fix the issues below in your file and preview again.',
  };

  const skippedErrors = errors.filter((e) => e.code === 'SKIPPED');

  return {
    status,
    totalFound,
    validCount,
    errorCount,
    skippedCount: skippedCount || skippedErrors.length,
    failedIndexes,
    fileErrorCount: fileErrors.length,
    headline: headlineByStatus[status],
    detail: detailByStatus[status],
    canImport: validCount > 0 && fileErrors.length === 0,
  };
}

export function enrichBulkParseErrors(errors = [], meta = {}) {
  const source = meta.source || 'auto';
  return errors.map((error) => {
    const isFile = isFileLevelParseError(error);
    const isSkipped = error.code === 'SKIPPED';
    return {
      ...error,
      ref: isFile || isSkipped ? 'File' : formatQuestionRef(error.index, source),
      severity: isSkipped ? 'info' : isFile ? 'error' : 'warning',
    };
  });
}

export function finalizeBulkParseResult(result, meta = {}) {
  const errors = enrichBulkParseErrors(result.errors || [], meta);
  const rowErrors = errors.filter((e) => !isFileLevelParseError(e) && e.code !== 'SKIPPED');
  const summary = buildBulkParseSummary(result.rows || [], errors, {
    ...meta,
    totalFound: (result.rows?.length || 0) + rowErrors.length,
    skippedCount: errors.filter((e) => e.code === 'SKIPPED').length,
  });
  return {
    rows: result.rows || [],
    errors,
    summary,
  };
}

function formatIndexList(indexes) {
  if (!indexes.length) return '';
  if (indexes.length <= 5) return indexes.join(', ');
  return `${indexes.slice(0, 5).join(', ')} (+${indexes.length - 5} more)`;
}

export function isFileLevelParseError(error) {
  return FILE_LEVEL_CODES.has(error?.code);
}

export function formatQuestionRef(index, source = 'auto') {
  const n = Number(index);
  if (!n || n <= 0) return 'File';
  if (source === 'csv') return `Row ${n}`;
  return `Question ${n}`;
}