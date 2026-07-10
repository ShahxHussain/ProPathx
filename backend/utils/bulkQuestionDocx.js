import mammoth from 'mammoth';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
} from 'docx';
import { parseBulkQuestionDrafts, parseBulkQuestionTableRows } from './bulkQuestionCsv.js';
import { BULK_TEMPLATE_MODES } from './bulkTemplateMode.js';
import { formatUiContextLine, BULK_TEMPLATE_INSTRUCTIONS } from './bulkTemplateGuidance.js';

const OUTLINE_UPLOAD_MESSAGE =
  'This file is a planning outline, not a question-entry file. Select a topic and download a question template (Mode Q), then upload that file.';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const PLACEHOLDER_HINTS = [
  /^enter the full question here/i,
  /^your question text here/i,
  /^first option text/i,
  /^second option text/i,
  /^e\.g\./i,
  /^example:/i,
  /^\(optional\)/i,
  /^\(required\)/i,
  /^your question here/i,
  /^type your question/i,
  /^select one\b/i,
  /^select a topic/i,
  /^list each option/i,
];

const EXAMPLE_QUESTION = {
  questionText: 'What is $2 + 2$?',
  options: ['3', '4', '5', '6'],
  correctRaw: 'B',
  explanation: 'Basic addition. You may use LaTeX between $...$ for math.',
};

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function htmlToPlain(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
}

function normalizePlainText(text) {
  return String(text || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

/** Strip inline tags from heading labels so matching remains stable. */
function normalizeHeadingHtml(html) {
  return String(html || '').replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_match, tag, inner) => {
    const label = htmlToPlain(inner).replace(/\s+/g, ' ').trim();
    return `<${tag}>${label}</${tag}>`;
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlaceholder(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  return PLACEHOLDER_HINTS.some((re) => re.test(t));
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22 })],
  });
}

function bodyParagraph(text, { italics = false, color } = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: String(text ?? ''),
        italics,
        color,
        size: 22,
      }),
    ],
  });
}

function bulletParagraph(text) {
  return new Paragraph({
    spacing: { after: 80 },
    bullet: { level: 0 },
    children: [new TextRun({ text: String(text), size: 21 })],
  });
}

function optionParagraph(letter, text, { italics = false, color } = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `${letter}. `, bold: true, size: 22 }),
      new TextRun({ text: String(text ?? ''), italics, color, size: 22 }),
    ],
  });
}

function questionTitle(number) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: '2563EB' },
    },
    children: [new TextRun({ text: `Question ${number}`, bold: true, size: 28, color: '1E40AF' })],
  });
}

function guidanceBox(children) {
  return new Paragraph({
    spacing: { after: 200 },
    shading: { type: ShadingType.CLEAR, fill: 'EFF6FF' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
    },
    children,
  });
}

function pageBreakParagraph() {
  return new Paragraph({ children: [new PageBreak()] });
}

function buildOutlineGuidancePage(title, contextLines, bullets, uiContext = {}) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 36, color: '1E3A8A' })],
    }),
    ...contextLines.map((line) => bodyParagraph(line, { italics: true, color: '64748B' })),
    bodyParagraph(`UI context: ${formatUiContextLine(uiContext)}`, { italics: true, color: '64748B' }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 160 },
      children: [new TextRun('Page 1 — How to use this file')],
    }),
    guidanceBox([
      new TextRun({ text: 'Guidance\n', bold: true, size: 22 }),
      ...bullets.flatMap((text, index) => [
        new TextRun({ text: `• ${text}${index < bullets.length - 1 ? '\n' : ''}`, size: 21 }),
      ]),
    ]),
  ];
}

function buildQuestionEntryGuidancePage(templateContext, uiContext = {}) {
  const { exam, subject, chapter, topic } = templateContext;

  return [
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: 'ProPath — Question entry', bold: true, size: 34, color: '1E3A8A' })],
    }),
    bodyParagraph(`Exam: ${exam.name} | Subject: ${subject.name}`),
    bodyParagraph(`Chapter: ${chapter?.name || '—'} | Topic: ${topic?.name || '—'}`),
    bodyParagraph(`UI context: ${formatUiContextLine(uiContext)}`, { italics: true, color: '64748B' }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 140 },
      children: [new TextRun({ text: 'How to use this file', bold: true, size: 26 })],
    }),
    ...BULK_TEMPLATE_INSTRUCTIONS.map((line) => bulletParagraph(line)),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
    bodyParagraph('Start entering your questions below. Copy Question 2 to add more.', {
      italics: true,
      color: '64748B',
    }),
    new Paragraph({ spacing: { after: 180 }, children: [] }),
  ];
}

function buildQuestionSection(number, data, { blank = false } = {}) {
  const hintColor = '94A3B8';

  const children = [questionTitle(number), sectionHeading('Question text')];

  if (blank) {
    children.push(
      bodyParagraph('Enter the full question here. Minimum 10 characters.', {
        italics: true,
        color: hintColor,
      })
    );
  } else {
    children.push(bodyParagraph(data.questionText));
  }

  children.push(
    sectionHeading('Answer options'),
    ...(blank
      ? [
          bodyParagraph('List each option on its own line (A and B required; C-F optional).', {
            italics: true,
            color: hintColor,
          }),
        ]
      : [])
  );

  const options = blank ? ['', '', '', '', '', ''] : data.options;
  OPTION_LETTERS.forEach((letter, i) => {
    const value = options[i] ?? '';
    if (blank) {
      const hint =
        i === 0
          ? 'First option text'
          : i === 1
            ? 'Second option text'
            : '(optional)';
      children.push(optionParagraph(letter, hint, { italics: true, color: hintColor }));
    } else if (value) {
      children.push(optionParagraph(letter, value));
    }
  });

  children.push(
    sectionHeading('Correct answer(s)'),
    bodyParagraph(
      blank ? 'B   (one letter, or A,C for multiple correct)' : data.correctRaw,
      blank ? { italics: true, color: hintColor } : {}
    ),
    sectionHeading('Explanation'),
    bodyParagraph(
      blank ? '(Optional) Why the correct answer is correct.' : data.explanation || '(Optional)',
      blank || !data.explanation ? { italics: true, color: hintColor } : {}
    ),
    new Paragraph({ spacing: { after: 200 }, children: [] })
  );

  return children;
}

export async function buildBulkTemplateDocxBuffer(templateContext, mode, uiContext = {}) {
  if (mode !== BULK_TEMPLATE_MODES.QUESTION_ENTRY) {
    throw new Error('Only topic question-entry template is enabled');
  }

  const children = [
    ...buildQuestionEntryGuidancePage(templateContext, uiContext),
    ...buildQuestionSection(1, null, { blank: true }),
    ...buildQuestionSection(2, null, { blank: true }),
    bodyParagraph('Copy the Question 2 block above to add Question 3, 4, 5…', {
      italics: true,
      color: '64748B',
    }),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function getBulkQuestionDocxTemplateBuffer() {
  return buildBulkTemplateDocxBuffer(
    {
      exam: { name: 'Your Exam' },
      subject: { name: 'Your Subject' },
      chapter: { name: 'Your Chapter' },
      topic: { name: 'Your Topic' },
      chapterGroups: [],
      chapterTopics: [],
      generatedAt: new Date().toISOString().slice(0, 10),
    },
    BULK_TEMPLATE_MODES.QUESTION_ENTRY
  );
}

function extractSection(blockHtml, headingLabel) {
  const re = new RegExp(
    `<h3[^>]*>\\s*${escapeRegex(headingLabel)}\\s*<\\/h3>([\\s\\S]*?)(?=<h[23][^>]*>|$)`,
    'i'
  );
  const match = blockHtml.match(re);
  return match ? htmlToPlain(match[1]) : '';
}

function extractSectionByAliases(blockHtml, aliases) {
  for (const alias of aliases) {
    const re = new RegExp(
      `<h[1-6][^>]*>\\s*${escapeRegex(alias)}\\s*:?\\s*<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6][^>]*>|$)`,
      'i'
    );
    const match = blockHtml.match(re);
    if (match) {
      const text = htmlToPlain(match[1]);
      if (text) return text;
    }
  }
  return '';
}

function extractInlineLabeledValue(blockHtml, aliases) {
  const plain = normalizePlainText(htmlToPlain(blockHtml));
  if (!plain) return '';

  const escaped = aliases.map((a) => escapeRegex(a)).join('|');
  const match = plain.match(new RegExp(`(?:^|\\n)(?:${escaped})\\s*:\\s*(.+)`, 'i'));
  return match ? normalizePlainText(match[1]) : '';
}

function parseOptionsFromSection(sectionText) {
  const options = [];
  const lines = normalizePlainText(sectionText).split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(?:Option\s*)?([A-Fa-f])[\s.):\-–—]+(.+)$/i);
    if (match) {
      const letter = match[1].toUpperCase();
      const idx = OPTION_LETTERS.indexOf(letter);
      if (idx >= 0) {
        const text = match[2].trim();
        if (!isPlaceholder(text)) {
          while (options.length <= idx) options.push('');
          options[idx] = text;
        }
      }
      continue;
    }

    if (/^provide 2/i.test(line) || /^leave e and f/i.test(line)) continue;
  }

  return options.filter(Boolean);
}

function splitDocumentIntoQuestionBlocks(html) {
  const parts = String(html).split(
    /<h[1-6][^>]*>\s*(?:Question|Q)(?:\s*(?:#|No\.?)|\s+)?(\d+)\s*[:\-–—.]?\s*<\/h[1-6]>/i
  );
  if (parts.length < 3) return [];

  const blocks = [];
  for (let i = 1; i < parts.length; i += 2) {
    const number = parseInt(parts[i], 10);
    const content = parts[i + 1] || '';
    blocks.push({ number, content });
  }
  return blocks;
}

function splitPlainTextIntoQuestionBlocks(html) {
  const text = normalizePlainText(htmlToPlain(html));
  if (!text) return [];

  const lines = text.split('\n');
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const qMatch = line.match(/^(?:Question|Q)(?:\s*(?:#|No\.?)|\s+)?(\d+)\s*[:\-–—.]?\s*$/i);
    if (qMatch) {
      if (current) blocks.push(current);
      current = { number: parseInt(qMatch[1], 10), content: '' };
      continue;
    }

    if (current) {
      current.content += `${line}\n`;
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

function extractSectionFromPlainBlock(content, aliases, stopAliases = []) {
  const lines = normalizePlainText(content).split('\n');
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (aliases.some((alias) => new RegExp(`^${escapeRegex(alias)}\\s*:?\\s*$`, 'i').test(line))) {
      start = i + 1;
      break;
    }
  }

  if (start < 0) return '';

  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (
      stopAliases.some((alias) => new RegExp(`^${escapeRegex(alias)}\\s*:?\\s*$`, 'i').test(line))
    ) {
      break;
    }
    if (line) out.push(line);
  }

  return out.join('\n').trim();
}

export function parseDocumentQuestionBlocks(blocks) {
  const drafts = [];

  for (const { number, content } of blocks) {
    const questionText =
      extractSectionByAliases(content, ['Question text', 'Question']) ||
      extractInlineLabeledValue(content, ['Question text', 'Question']) ||
      extractSection(content, 'Question text');
    const questionType =
      extractSectionByAliases(content, ['Question type']) ||
      extractInlineLabeledValue(content, ['Question type']) ||
      extractSection(content, 'Question type');
    const optionsSection =
      extractSectionByAliases(content, ['Answer options', 'Options']) ||
      extractSection(content, 'Answer options');
    const correctRaw = (
      extractSectionByAliases(content, [
        'Correct answer(s)',
        'Correct answers',
        'Correct answer',
        'Correct option',
        'Answer key',
      ]) ||
      extractInlineLabeledValue(content, [
        'Correct answer(s)',
        'Correct answers',
        'Correct answer',
        'Correct option',
        'Answer key',
      ]) ||
      extractSection(content, 'Correct answer(s)')
    ).replace(/^Correct answers?\s*:\s*/i, '');
    const explanation =
      extractSectionByAliases(content, ['Explanation', 'Rationale']) ||
      extractInlineLabeledValue(content, ['Explanation', 'Rationale']) ||
      extractSection(content, 'Explanation');

    if (isPlaceholder(questionText)) continue;
    if (
      questionText.replace(/\s+/g, '') === 'Whatis$2+2$?' ||
      questionText === 'What is $2 + 2$?' ||
      questionText === 'What is $2+2$?'
    ) {
      continue;
    }

    drafts.push({
      rowIndex: number,
      questionText,
      questionType: isPlaceholder(questionType) ? undefined : questionType,
      optionTexts: parseOptionsFromSection(optionsSection),
      correctRaw: isPlaceholder(correctRaw) ? '' : correctRaw,
      explanation: isPlaceholder(explanation) ? '' : explanation,
    });
  }

  return drafts;
}

function parsePlainTextQuestionBlocks(blocks) {
  const drafts = [];
  const allLabels = [
    'Question text',
    'Question',
    'Answer options',
    'Options',
    'Correct answer(s)',
    'Correct answers',
    'Correct answer',
    'Explanation',
    'Rationale',
  ];

  for (const { number, content } of blocks) {
    const questionText = extractSectionFromPlainBlock(content, ['Question text', 'Question'], allLabels);
    const optionsSection = extractSectionFromPlainBlock(content, ['Answer options', 'Options'], allLabels);
    const correctRaw = extractSectionFromPlainBlock(
      content,
      ['Correct answer(s)', 'Correct answers', 'Correct answer'],
      allLabels
    ).replace(/^Correct answers?\s*:\s*/i, '');
    const explanation = extractSectionFromPlainBlock(content, ['Explanation', 'Rationale'], allLabels);

    if (isPlaceholder(questionText)) continue;
    if (
      questionText.replace(/\s+/g, '') === 'Whatis$2+2$?' ||
      questionText === 'What is $2 + 2$?' ||
      questionText === 'What is $2+2$?'
    ) {
      continue;
    }

    drafts.push({
      rowIndex: number,
      questionText,
      optionTexts: parseOptionsFromSection(optionsSection),
      correctRaw: isPlaceholder(correctRaw) ? '' : correctRaw,
      explanation: isPlaceholder(explanation) ? '' : explanation,
    });
  }

  return drafts;
}

export function htmlTableToRows(html) {
  const tableMatches = String(html || '').match(/<table[\s\S]*?<\/table>/gi);
  if (!tableMatches?.length) return null;

  const rows = [];
  for (const table of tableMatches) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch = trRegex.exec(table);
    while (trMatch) {
      const cells = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch = cellRegex.exec(trMatch[1]);
      while (cellMatch) {
        cells.push(
          normalizePlainText(decodeHtmlEntities(cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')))
        );
        cellMatch = cellRegex.exec(trMatch[1]);
      }
      if (cells.some((c) => c.length > 0)) rows.push(cells);
      trMatch = trRegex.exec(table);
    }
  }

  return rows.length ? rows : null;
}

export function detectBulkDocxOutline(html) {
  const plain = htmlToPlain(html);
  return /subject outline/i.test(plain) || /chapter outline/i.test(plain);
}

export async function parseBulkQuestionDocx(buffer, context = {}, options = {}) {
  if (!buffer?.length) {
    return { rows: [], errors: [{ index: 0, code: 'EMPTY_FILE', message: 'DOCX file is empty' }] };
  }

  let html;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = normalizeHeadingHtml(result.value);
  } catch (err) {
    return {
      rows: [],
      errors: [{ index: 0, code: 'PARSE_ERROR', message: err.message || 'Failed to read DOCX file' }],
    };
  }

  if (detectBulkDocxOutline(html)) {
    return {
      rows: [],
      errors: [{ index: 0, code: 'OUTLINE_FILE', message: OUTLINE_UPLOAD_MESSAGE }],
    };
  }

  const questionBlocks = splitDocumentIntoQuestionBlocks(html);
  if (questionBlocks.length) {
    const drafts = parseDocumentQuestionBlocks(questionBlocks);
    if (drafts.length) {
      return parseBulkQuestionDrafts(drafts, context, options);
    }
    return {
      rows: [],
      errors: [
        {
          index: 0,
          code: 'NO_QUESTIONS',
          message:
            'Question headings were found, but every block is empty or still uses template placeholder text. Fill in question text, options, and correct answers.',
        },
      ],
    };
  }

  const plainQuestionBlocks = splitPlainTextIntoQuestionBlocks(html);
  if (plainQuestionBlocks.length) {
    const drafts = parsePlainTextQuestionBlocks(plainQuestionBlocks);
    if (drafts.length) {
      return parseBulkQuestionDrafts(drafts, context, options);
    }
  }

  const tableRows = htmlTableToRows(html);
  if (tableRows?.length) {
    return parseBulkQuestionTableRows(tableRows, context, options);
  }

  return {
    rows: [],
    errors: [
      {
        index: 0,
        code: 'NO_QUESTIONS',
        message:
          'No questions found. Use the ProPath Word template: each question needs a "Question 1" heading and section labels (Question text, Answer options, Correct answer(s), …).',
      },
    ],
  };
}
