import React from 'react';
import LaTeXRenderer from './LaTeXRenderer';
import './LaTeXPreview.css';

/**
 * LaTeXPreview Component
 * Shows a live preview of LaTeX-rendered text
 */
const LaTeXPreview = ({ text, label = 'Preview', className = '' }) => {
  if (!text || !text.trim()) {
    return null;
  }

  return (
    <div className={`latex-preview ${className}`}>
      <div className="latex-preview-label">{label}</div>
      <div className="latex-preview-content">
        <LaTeXRenderer text={text} />
      </div>
    </div>
  );
};

export default LaTeXPreview;
