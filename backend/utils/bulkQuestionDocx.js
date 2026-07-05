import mammoth from 'mammoth';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
} from 'docx';
import { parseBulkQuestionDrafts, parseBulkQuestionTableRows } from './bulkQuestionCsv.js';

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

const EXAMPLE_QUESTIONS = [
  {
    questionText: 'What is $2 + 2$?',
    questionType: 'Single Correct',
    options: ['3', '4', '5', '6'],
    correctRaw: 'B',
    explanation: 'Basic addition. You may use LaTeX between $...$ for math.',
  },
  {
    questionText: 'Select all prime numbers from the options below.',
    questionType: 'Multiple Correct',
    options: ['2', '4', '5', '9'],
    correctRaw: 'A, C',
    explanation: '2 and 5 are prime; 4 and 9 are composite.',
  },
];

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

/** Strip inline tags from h') so h2/h3 labels match reliably after mammoth. */
function normalizeHeadingHtml(html) {
  return String(html || '').replace(/<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi, (_match, tag, inner) => {
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

function buildInstructionsSection() {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'ProPath MCQ Authoring Template',
          bold: true,
          size: 36,
          color: '1E3A8A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: 'Bulk import · Subject Expert',
          size: 24,
          color: '64748B',
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 160 },
      children: [new TextRun('Step 1 — Set in ProPath app (not in this file)')],
    }),
    new Paragraph({
      spacing: { after: 200 },
      shading: { type: ShadingType.CLEAR, fill: 'EFF6FF' },
      border: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
      },
      children: [
        new TextRun({
          text: 'These apply to every question in the batch. Select them under Create → Bulk upload before uploading this document:\n\n',
          size: 21,
        }),
        new TextRun({ text: 'Exam', bold: true }),
        new TextRun(' · '),
        new TextRun({ text: 'Subject', bold: true }),
        new TextRun(' · '),
        new TextRun({ text: 'Chapter', bold: true }),
        new TextRun(' · '),
        new TextRun({ text: 'Topic', bold: true }),
        new TextRun(' · '),
        new TextRun({ text: 'Difficulty', bold: true }),
        new TextRun(' · '),
        new TextRun({ text: 'Source', bold: true }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 160 },
      children: [new TextRun('Step 2 — Fill each question block below')],
    }),
    bulletParagraph(
      'One “Question N” section = one MCQ. Copy the blank Question 3 block to add more.'
    ),
    bulletParagraph(
      'Do not rename section headings (Question text, Question type, Answer options, …) — the importer uses them.'
    ),
    bulletParagraph('Use LaTeX for math: $x^2 + 1$ or $$\\frac{a}{b}$$.'),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 160 },
      children: [new TextRun('In-file fields only')],
    }),
    new Paragraph({
      spacing: { after: 240 },
      shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
      children: [
        new TextRun({ text: 'Question type: ', bold: true }),
        new TextRun('Single Correct · Multiple Correct'),
        new TextRun({ text: '\nAnswer options: ', bold: true }),
        new TextRun('A through F (minimum 2; E and F optional)'),
        new TextRun({ text: '\nCorrect answer(s): ', bold: true }),
        new TextRun('letter(s) A–F, comma-separated when multiple are correct'),
        new TextRun({ text: '\nExplanation: ', bold: true }),
        new TextRun('optional'),
      ],
    }),
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
    sectionHeading('Question type'),
    bodyParagraph(
      blank ? 'Single Correct' : data.questionType,
      blank ? { italics: true, color: hintColor } : {}
    ),
    sectionHeading('Answer options'),
    bodyParagraph(
      blank
        ? 'List each option on its own line (A and B required; C–F as needed).'
        : 'Provide 2–6 options. Leave E and F blank if not needed.',
      { italics: blank, color: blank ? hintColor : undefined }
    )
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

export async function getBulkQuestionDocxTemplateBuffer() {
  const children = [
    ...buildInstructionsSection(),
    ...buildQuestionSection(1, EXAMPLE_QUESTIONS[0]),
    ...buildQuestionSection(2, EXAMPLE_QUESTIONS[1]),
    ...buildQuestionSection(3, null, { blank: true }),
  ];

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

function extractSection(blockHtml, headingLabel) {
  const re = new RegExp(
    `<h3[^>]*>\\s*${escapeRegex(headingLabel)}\\s*<\\/h3>([\\s\\S]*?)(?=<h[23][^>]*>|$)`,
    'i'
  );
  const match = blockHtml.match(re);
  return match ? htmlToPlain(match[1]) : '';
}

function parseOptionsFromSection(sectionText) {
  const options = [];
  const lines = sectionText.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([A-Fa-f])[\s.):\-–—]+(.+)$/);
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
  const parts = String(html).split(/<h2[^>]*>\s*Question\s+(\d+)\s*<\/h2>/i);
  if (parts.length < 3) return [];

  const blocks = [];
  for (let i = 1; i < parts.length; i += 2) {
    const number = parseInt(parts[i], 10);
    const content = parts[i + 1] || '';
    blocks.push({ number, content });
  }
  return blocks;
}

export function parseDocumentQuestionBlocks(blocks) {
  const drafts = [];

  for (const { number, content } of blocks) {
    const questionText = extractSection(content, 'Question text');
    const questionType = extractSection(content, 'Question type');
    const optionsSection = extractSection(content, 'Answer options');
    const correctRaw = extractSection(content, 'Correct answer(s)').replace(/^Correct answers?\s*:\s*/i, '');
    const explanation = extractSection(content, 'Explanation');

    if (isPlaceholder(questionText)) continue;

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

export function htmlTableToRows(html) {
  const tableMatch = String(html || '').match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return null;

  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch = trRegex.exec(tableMatch[0]);
  while (trMatch) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch = cellRegex.exec(trMatch[1]);
    while (cellMatch) {
      cells.push(decodeHtmlEntities(cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')));
      cellMatch = cellRegex.exec(trMatch[1]);
    }
    if (cells.some((c) => c.length > 0)) rows.push(cells);
    trMatch = trRegex.exec(tableMatch[0]);
  }

  return rows.length ? rows : null;
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

  const questionBlocks = splitDocumentIntoQuestionBlocks(html);
  if (questionBlocks.length) {
    const drafts = parseDocumentQuestionBlocks(questionBlocks);
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
          'No questions found. Use the ProPath Word template: each question needs a "Question 1" heading and section labels (Question text, Question type, Answer options, …).',
      },
    ],
  };
}
