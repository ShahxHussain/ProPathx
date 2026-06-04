import React, { useState, useRef, useEffect } from 'react';
import { 
  Code, 
  Bold, 
  Italic, 
  Type, 
  Divide,
  X,
  Plus,
  Minus,
  Equal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import LaTeXPreview from './LaTeXPreview';
import './LaTeXEditor.css';

/**
 * LaTeXEditor Component
 * User-friendly editor for questions with LaTeX support
 * Designed for non-technical subject experts
 */
const LaTeXEditor = ({ 
  value = '', 
  onChange, 
  placeholder = 'Enter your text here...',
  label = '',
  rows = 4,
  showPreview = true,
  className = '',
  enableLaTeX = true, // Toggle for LaTeX features
  onToggleLaTeX = null // Callback when toggle changes
}) => {
  const textareaRef = useRef(null);
  const [showLaTeXMenu, setShowLaTeXMenu] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [latexEnabled, setLatexEnabled] = useState(enableLaTeX !== undefined ? enableLaTeX : false);

  // Sync with prop changes
  useEffect(() => {
    if (enableLaTeX !== undefined) {
      setLatexEnabled(enableLaTeX);
    }
  }, [enableLaTeX]);

  // Common LaTeX templates for non-technical users
  const latexTemplates = [
    {
      name: 'Fraction',
      icon: Divide,
      template: '\\frac{numerator}{denominator}',
      example: '\\frac{1}{2}',
      description: 'Create a fraction'
    },
    {
      name: 'Square Root',
      icon: Type,
      template: '\\sqrt{expression}',
      example: '\\sqrt{x}',
      description: 'Square root symbol'
    },
    {
      name: 'Power/Exponent',
      icon: X,
      template: '^{exponent}',
      example: 'x^{2}',
      description: 'Raise to power'
    },
    {
      name: 'Subscript',
      icon: ChevronDown,
      template: '_{subscript}',
      example: 'x_{1}',
      description: 'Subscript text'
    },
    {
      name: 'Greek Alpha',
      icon: Type,
      template: '\\alpha',
      example: '\\alpha',
      description: 'Greek letter alpha'
    },
    {
      name: 'Greek Beta',
      icon: Type,
      template: '\\beta',
      example: '\\beta',
      description: 'Greek letter beta'
    },
    {
      name: 'Sum',
      icon: Plus,
      template: '\\sum_{i=1}^{n}',
      example: '\\sum_{i=1}^{n}',
      description: 'Summation symbol'
    },
    {
      name: 'Integral',
      icon: Type,
      template: '\\int_{a}^{b}',
      example: '\\int_{0}^{1}',
      description: 'Integral symbol'
    },
    {
      name: 'Not Equal',
      icon: Equal,
      template: '\\neq',
      example: '\\neq',
      description: 'Not equal to'
    },
    {
      name: 'Less Than Equal',
      icon: Type,
      template: '\\leq',
      example: '\\leq',
      description: 'Less than or equal'
    },
    {
      name: 'Greater Than Equal',
      icon: Type,
      template: '\\geq',
      example: '\\geq',
      description: 'Greater than or equal'
    },
    {
      name: 'Plus Minus',
      icon: Plus,
      template: '\\pm',
      example: '\\pm',
      description: 'Plus or minus'
    },
    {
      name: 'Infinity',
      icon: Type,
      template: '\\infty',
      example: '\\infty',
      description: 'Infinity symbol'
    },
    {
      name: 'Pi',
      icon: Type,
      template: '\\pi',
      example: '\\pi',
      description: 'Pi symbol'
    }
  ];

  const insertText = (text) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = value || '';
    
    const newValue = 
      currentValue.substring(0, start) + 
      text + 
      currentValue.substring(end);
    
    onChange(newValue);
    
    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + text.length;
      textarea.setSelectionRange(newPosition, newPosition);
      setCursorPosition(newPosition);
    }, 0);
  };

  const insertLaTeX = (template) => {
    insertText(`$${template}$`);
    setShowLaTeXMenu(false);
  };

  const insertBlockLaTeX = (template) => {
    insertText(`\n\n$$${template}$$\n\n`);
    setShowLaTeXMenu(false);
  };

  const wrapSelection = (before, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const currentValue = value || '';
    
    const newValue = 
      currentValue.substring(0, start) + 
      before + selectedText + after + 
      currentValue.substring(end);
    
    onChange(newValue);
    
    setTimeout(() => {
      textarea.focus();
      const newEnd = start + before.length + selectedText.length + after.length;
      textarea.setSelectionRange(newEnd, newEnd);
    }, 0);
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + M to toggle LaTeX menu
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault();
      setShowLaTeXMenu(!showLaTeXMenu);
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('keydown', handleKeyDown);
      return () => {
        textarea.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showLaTeXMenu]);

  const handleToggleLaTeX = () => {
    const newState = !latexEnabled;
    setLatexEnabled(newState);
    if (onToggleLaTeX) {
      onToggleLaTeX(newState);
    }
  };

  return (
    <div className={`latex-editor-container ${className}`}>
      {label && (
        <div className="latex-editor-label">
          <span>{label}</span>
          {onToggleLaTeX && (
            <button
              type="button"
              className={`latex-toggle-btn ${latexEnabled ? 'active' : ''}`}
              onClick={handleToggleLaTeX}
              title={latexEnabled ? 'Disable LaTeX editor' : 'Enable LaTeX editor'}
            >
              <Code size={14} />
              <span>{latexEnabled ? 'LaTeX ON' : 'LaTeX OFF'}</span>
            </button>
          )}
        </div>
      )}
      
      {latexEnabled && (
        <div className="latex-editor-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => wrapSelection('**', '**')}
            title="Bold (Ctrl+B)"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => wrapSelection('*', '*')}
            title="Italic (Ctrl+I)"
          >
            <Italic size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <div className="toolbar-dropdown">
            <button
              type="button"
              className="toolbar-btn toolbar-btn-primary"
              onClick={() => setShowLaTeXMenu(!showLaTeXMenu)}
              title="Insert LaTeX Math (Ctrl+M)"
            >
              <Code size={16} />
              <span>Math</span>
              {showLaTeXMenu ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            
            {showLaTeXMenu && (
              <div className="latex-menu">
                <div className="latex-menu-header">
                  <span>Insert Math Expression</span>
                  <button
                    type="button"
                    className="latex-menu-close"
                    onClick={() => setShowLaTeXMenu(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="latex-menu-content">
                  <div className="latex-menu-section">
                    <div className="latex-menu-title">Common Symbols</div>
                    <div className="latex-templates-grid">
                      {latexTemplates.map((item, index) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={index}
                            type="button"
                            className="latex-template-btn"
                            onClick={() => insertLaTeX(item.template)}
                            title={item.description}
                          >
                            <Icon size={16} />
                            <div className="latex-template-info">
                              <span className="latex-template-name">{item.name}</span>
                              <code className="latex-template-example">{item.example}</code>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="latex-menu-section">
                    <div className="latex-menu-title">Quick Insert</div>
                    <div className="latex-quick-insert">
                      <button
                        type="button"
                        className="latex-quick-btn"
                        onClick={() => insertLaTeX('x^{2}')}
                      >
                        x² (Power)
                      </button>
                      <button
                        type="button"
                        className="latex-quick-btn"
                        onClick={() => insertLaTeX('\\frac{a}{b}')}
                      >
                        a/b (Fraction)
                      </button>
                      <button
                        type="button"
                        className="latex-quick-btn"
                        onClick={() => insertLaTeX('\\sqrt{x}')}
                      >
                        √x (Square Root)
                      </button>
                      <button
                        type="button"
                        className="latex-quick-btn"
                        onClick={() => insertLaTeX('\\alpha')}
                      >
                        α (Alpha)
                      </button>
                      <button
                        type="button"
                        className="latex-quick-btn"
                        onClick={() => insertLaTeX('\\beta')}
                      >
                        β (Beta)
                      </button>
                      <button
                        type="button"
                        className="latex-quick-btn"
                        onClick={() => insertLaTeX('\\pi')}
                      >
                        π (Pi)
                      </button>
                    </div>
                  </div>

                  <div className="latex-menu-help">
                    <strong>Tip:</strong> Use <code>$...$</code> for inline math or <code>$$...$$</code> for block math.
                    You can also type LaTeX directly: <code>$x^2 + y^2 = z^2$</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      <textarea
        ref={textareaRef}
        value={value || ''}
        onChange={(e) => {
          onChange(e.target.value);
          setCursorPosition(e.target.selectionStart);
        }}
        placeholder={placeholder}
        rows={rows}
        className={`latex-editor-textarea ${!latexEnabled ? 'simple-mode' : ''}`}
      />

      {latexEnabled && showPreview && value && value.trim() && (
        <LaTeXPreview text={value} label="Live Preview" />
      )}
    </div>
  );
};

export default LaTeXEditor;
