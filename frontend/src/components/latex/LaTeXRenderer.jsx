import React from 'react';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import './LaTeXRenderer.css';

/**
 * LaTeXRenderer Component
 * Renders text that may contain LaTeX expressions
 * Supports both inline math ($...$) and block math ($$...$$)
 */
const LaTeXRenderer = ({ text, displayMode = false, className = '' }) => {
  if (!text) return null;

  const rootClass = ['latex-renderer', className].filter(Boolean).join(' ');

  // Pattern to match LaTeX expressions
  // Inline math: $...$ or \(...\)
  // Block math: $$...$$ or \[...\]
  const blockMathRegex = /\$\$([^$]+)\$\$/g;
  const inlineMathRegex = /(?<!\$)\$(?!\$)([^$]+)\$/g;
  const blockMathBracketRegex = /\\\[([^\]]+)\\\]/g;
  const inlineMathBracketRegex = /\\\(([^)]+)\\\)/g;

  // Check if text contains any LaTeX
  const hasBlockMath = blockMathRegex.test(text) || blockMathBracketRegex.test(text);
  const hasInlineMath = inlineMathRegex.test(text) || inlineMathBracketRegex.test(text);

  // If no LaTeX found, return plain text
  if (!hasBlockMath && !hasInlineMath) {
    return <span className={rootClass}>{text}</span>;
  }

  // Reset regex lastIndex
  blockMathRegex.lastIndex = 0;
  inlineMathRegex.lastIndex = 0;
  blockMathBracketRegex.lastIndex = 0;
  inlineMathBracketRegex.lastIndex = 0;

  const parts = [];
  let lastIndex = 0;

  // Process block math first (higher priority)
  let match;
  const blockMatches = [];
  
  // Find all block math matches
  while ((match = blockMathRegex.exec(text)) !== null) {
    blockMatches.push({ type: 'block', start: match.index, end: match.index + match[0].length, content: match[1] });
  }
  while ((match = blockMathBracketRegex.exec(text)) !== null) {
    blockMatches.push({ type: 'block', start: match.index, end: match.index + match[0].length, content: match[1] });
  }

  // Find all inline math matches
  const inlineMatches = [];
  while ((match = inlineMathRegex.exec(text)) !== null) {
    inlineMatches.push({ type: 'inline', start: match.index, end: match.index + match[0].length, content: match[1] });
  }
  while ((match = inlineMathBracketRegex.exec(text)) !== null) {
    inlineMatches.push({ type: 'inline', start: match.index, end: match.index + match[0].length, content: match[1] });
  }

  // Combine and sort all matches
  const allMatches = [...blockMatches, ...inlineMatches].sort((a, b) => a.start - b.start);

  // Remove overlapping matches (prefer block over inline)
  const filteredMatches = [];
  for (const match of allMatches) {
    const overlaps = filteredMatches.some(m => 
      (match.start >= m.start && match.start < m.end) ||
      (match.end > m.start && match.end <= m.end) ||
      (match.start <= m.start && match.end >= m.end)
    );
    if (!overlaps) {
      filteredMatches.push(match);
    }
  }

  // Build parts array
  filteredMatches.forEach((match) => {
    // Add text before match
    if (match.start > lastIndex) {
      const beforeText = text.substring(lastIndex, match.start);
      if (beforeText) {
        parts.push({ type: 'text', content: beforeText });
      }
    }

    // Add LaTeX content
    try {
      if (match.type === 'block') {
        parts.push({ type: 'block-math', content: match.content });
      } else {
        parts.push({ type: 'inline-math', content: match.content });
      }
    } catch (error) {
      // If LaTeX parsing fails, show as plain text
      parts.push({ type: 'text', content: text.substring(match.start, match.end) });
    }

    lastIndex = match.end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  // If no parts were created (shouldn't happen), return original text
  if (parts.length === 0) {
    return <span className={rootClass}>{text}</span>;
  }

  return (
    <span className={rootClass}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.content}</span>;
        } else if (part.type === 'block-math') {
          try {
            return (
              <div key={index} style={{ margin: '8px 0' }}>
                <BlockMath math={part.content} />
              </div>
            );
          } catch (error) {
            return <span key={index} style={{ color: '#ef4444' }}>$${part.content}$$</span>;
          }
        } else if (part.type === 'inline-math') {
          try {
            return <InlineMath key={index} math={part.content} />;
          } catch (error) {
            return <span key={index} style={{ color: '#ef4444' }}>${part.content}$</span>;
          }
        }
        return null;
      })}
    </span>
  );
};

export default LaTeXRenderer;
