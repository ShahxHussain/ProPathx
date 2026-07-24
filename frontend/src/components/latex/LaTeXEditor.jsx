import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Code, 
  Bold, 
  Italic, 
  X,
  ChevronDown,
  ChevronUp,
  Search,
  BookOpen,
  Copy,
  Check,
} from 'lucide-react';
import LaTeXPreview from './LaTeXPreview';
import './LaTeXEditor.css';

/* ─── Comprehensive LaTeX reference ─── */
const LATEX_REFERENCE = [
  {
    category: 'Greek Letters',
    items: [
      { cmd: '\\alpha',    label: 'α  alpha' },
      { cmd: '\\beta',     label: 'β  beta' },
      { cmd: '\\gamma',    label: 'γ  gamma' },
      { cmd: '\\Gamma',    label: 'Γ  Gamma (capital)' },
      { cmd: '\\delta',    label: 'δ  delta' },
      { cmd: '\\Delta',    label: 'Δ  Delta (capital)' },
      { cmd: '\\epsilon',  label: 'ε  epsilon' },
      { cmd: '\\varepsilon', label: 'ε  varepsilon' },
      { cmd: '\\zeta',     label: 'ζ  zeta' },
      { cmd: '\\eta',      label: 'η  eta' },
      { cmd: '\\theta',    label: 'θ  theta' },
      { cmd: '\\Theta',    label: 'Θ  Theta (capital)' },
      { cmd: '\\iota',     label: 'ι  iota' },
      { cmd: '\\kappa',    label: 'κ  kappa' },
      { cmd: '\\lambda',   label: 'λ  lambda' },
      { cmd: '\\Lambda',   label: 'Λ  Lambda (capital)' },
      { cmd: '\\mu',       label: 'μ  mu' },
      { cmd: '\\nu',       label: 'ν  nu' },
      { cmd: '\\xi',       label: 'ξ  xi' },
      { cmd: '\\Xi',       label: 'Ξ  Xi (capital)' },
      { cmd: '\\pi',       label: 'π  pi' },
      { cmd: '\\Pi',       label: 'Π  Pi (capital)' },
      { cmd: '\\rho',      label: 'ρ  rho' },
      { cmd: '\\sigma',    label: 'σ  sigma' },
      { cmd: '\\Sigma',    label: 'Σ  Sigma (capital)' },
      { cmd: '\\tau',      label: 'τ  tau' },
      { cmd: '\\upsilon',  label: 'υ  upsilon' },
      { cmd: '\\phi',      label: 'φ  phi' },
      { cmd: '\\varphi',   label: 'φ  varphi' },
      { cmd: '\\Phi',      label: 'Φ  Phi (capital)' },
      { cmd: '\\chi',      label: 'χ  chi' },
      { cmd: '\\psi',      label: 'ψ  psi' },
      { cmd: '\\Psi',      label: 'Ψ  Psi (capital)' },
      { cmd: '\\omega',    label: 'ω  omega' },
      { cmd: '\\Omega',    label: 'Ω  Omega (capital)' },
    ],
  },
  {
    category: 'Operators',
    items: [
      { cmd: '\\frac{a}{b}',  label: 'Fraction a/b' },
      { cmd: '\\sqrt{x}',     label: 'Square root' },
      { cmd: '\\sqrt[n]{x}',  label: 'Nth root' },
      { cmd: '\\sum_{i=1}^{n}', label: 'Summation' },
      { cmd: '\\prod_{i=1}^{n}', label: 'Product' },
      { cmd: '\\int_{a}^{b}', label: 'Integral' },
      { cmd: '\\iint',        label: 'Double integral' },
      { cmd: '\\iiint',       label: 'Triple integral' },
      { cmd: '\\oint',        label: 'Contour integral' },
      { cmd: '\\lim_{x \\to a}', label: 'Limit' },
      { cmd: '\\log',         label: 'Logarithm' },
      { cmd: '\\ln',          label: 'Natural log' },
      { cmd: '\\log_{b}',     label: 'Log base b' },
      { cmd: '\\partial',     label: 'Partial derivative ∂' },
      { cmd: '\\nabla',       label: 'Nabla / Del ∇' },
      { cmd: '\\binom{n}{k}', label: 'Binomial coefficient' },
    ],
  },
  {
    category: 'Relations',
    items: [
      { cmd: '\\neq',       label: '≠  not equal' },
      { cmd: '\\leq',       label: '≤  less or equal' },
      { cmd: '\\geq',       label: '≥  greater or equal' },
      { cmd: '\\lt',        label: '<  less than' },
      { cmd: '\\gt',        label: '>  greater than' },
      { cmd: '\\approx',    label: '≈  approximately' },
      { cmd: '\\equiv',     label: '≡  equivalent' },
      { cmd: '\\sim',       label: '∼  similar' },
      { cmd: '\\simeq',     label: '≃  similar or equal' },
      { cmd: '\\cong',      label: '≅  congruent' },
      { cmd: '\\propto',    label: '∝  proportional' },
      { cmd: '\\ll',        label: '≪  much less than' },
      { cmd: '\\gg',        label: '≫  much greater than' },
      { cmd: '\\subset',    label: '⊂  subset' },
      { cmd: '\\supset',    label: '⊃  superset' },
      { cmd: '\\subseteq',  label: '⊆  subset or equal' },
      { cmd: '\\supseteq',  label: '⊇  superset or equal' },
      { cmd: '\\in',        label: '∈  element of' },
      { cmd: '\\notin',     label: '∉  not element of' },
      { cmd: '\\ni',        label: '∋  contains' },
      { cmd: '\\perp',      label: '⊥  perpendicular' },
      { cmd: '\\parallel',  label: '∥  parallel' },
    ],
  },
  {
    category: 'Arrows',
    items: [
      { cmd: '\\rightarrow',      label: '→  right arrow' },
      { cmd: '\\leftarrow',       label: '←  left arrow' },
      { cmd: '\\leftrightarrow',  label: '↔  left-right arrow' },
      { cmd: '\\Rightarrow',      label: '⇒  implies' },
      { cmd: '\\Leftarrow',       label: '⇐  implied by' },
      { cmd: '\\Leftrightarrow',  label: '⇔  if and only if' },
      { cmd: '\\uparrow',         label: '↑  up arrow' },
      { cmd: '\\downarrow',       label: '↓  down arrow' },
      { cmd: '\\mapsto',          label: '↦  maps to' },
      { cmd: '\\to',              label: '→  to (limit)' },
      { cmd: '\\gets',            label: '←  gets' },
      { cmd: '\\nearrow',         label: '↗  northeast arrow' },
      { cmd: '\\searrow',         label: '↘  southeast arrow' },
    ],
  },
  {
    category: 'Formatting & Layout',
    items: [
      { cmd: '^{n}',              label: 'Superscript / power' },
      { cmd: '_{n}',              label: 'Subscript' },
      { cmd: '\\overline{x}',     label: 'Overline (x̄)' },
      { cmd: '\\underline{x}',    label: 'Underline' },
      { cmd: '\\hat{x}',          label: 'Hat (x̂)' },
      { cmd: '\\bar{x}',          label: 'Bar (x̄)' },
      { cmd: '\\vec{v}',          label: 'Vector arrow' },
      { cmd: '\\dot{x}',          label: 'Dot above (ẋ)' },
      { cmd: '\\ddot{x}',         label: 'Double dot (ẍ)' },
      { cmd: '\\tilde{x}',        label: 'Tilde (x̃)' },
      { cmd: '\\mathbf{x}',       label: 'Bold math' },
      { cmd: '\\mathit{x}',       label: 'Italic math' },
      { cmd: '\\mathrm{text}',    label: 'Roman text in math' },
      { cmd: '\\text{word}',      label: 'Text in math mode' },
      { cmd: '\\left( \\right)',   label: 'Auto-size parentheses' },
      { cmd: '\\left[ \\right]',   label: 'Auto-size brackets' },
      { cmd: '\\left\\{ \\right\\}', label: 'Auto-size braces' },
      { cmd: '\\underbrace{x}_{label}', label: 'Underbrace with label' },
      { cmd: '\\overbrace{x}^{label}',  label: 'Overbrace with label' },
    ],
  },
  {
    category: 'Trigonometry',
    items: [
      { cmd: '\\sin',    label: 'sin' },
      { cmd: '\\cos',    label: 'cos' },
      { cmd: '\\tan',    label: 'tan' },
      { cmd: '\\cot',    label: 'cot' },
      { cmd: '\\sec',    label: 'sec' },
      { cmd: '\\csc',    label: 'csc' },
      { cmd: '\\arcsin', label: 'arcsin' },
      { cmd: '\\arccos', label: 'arccos' },
      { cmd: '\\arctan', label: 'arctan' },
      { cmd: '\\sinh',   label: 'sinh (hyperbolic)' },
      { cmd: '\\cosh',   label: 'cosh (hyperbolic)' },
      { cmd: '\\tanh',   label: 'tanh (hyperbolic)' },
      { cmd: '\\sin^{2}\\theta', label: 'sin² θ' },
      { cmd: '\\cos^{2}\\theta', label: 'cos² θ' },
    ],
  },
  {
    category: 'Miscellaneous',
    items: [
      { cmd: '\\pm',       label: '±  plus-minus' },
      { cmd: '\\mp',       label: '∓  minus-plus' },
      { cmd: '\\times',    label: '×  times' },
      { cmd: '\\div',      label: '÷  division' },
      { cmd: '\\cdot',     label: '·  centered dot' },
      { cmd: '\\circ',     label: '∘  composition' },
      { cmd: '\\infty',    label: '∞  infinity' },
      { cmd: '\\forall',   label: '∀  for all' },
      { cmd: '\\exists',   label: '∃  there exists' },
      { cmd: '\\nexists',  label: '∄  does not exist' },
      { cmd: '\\emptyset',  label: '∅  empty set' },
      { cmd: '\\cup',      label: '∪  union' },
      { cmd: '\\cap',      label: '∩  intersection' },
      { cmd: '\\setminus', label: '∖  set minus' },
      { cmd: '\\neg',      label: '¬  negation' },
      { cmd: '\\land',     label: '∧  logical and' },
      { cmd: '\\lor',      label: '∨  logical or' },
      { cmd: '\\angle',    label: '∠  angle' },
      { cmd: '\\triangle', label: '△  triangle' },
      { cmd: '\\degree',   label: '°  degree' },
      { cmd: '\\prime',    label: '′  prime' },
      { cmd: '\\star',     label: '⋆  star' },
      { cmd: '\\therefore', label: '∴  therefore' },
      { cmd: '\\because',  label: '∵  because' },
      { cmd: '\\ldots',    label: '…  horizontal dots' },
      { cmd: '\\cdots',    label: '⋯  centered dots' },
      { cmd: '\\vdots',    label: '⋮  vertical dots' },
      { cmd: '\\ddots',    label: '⋱  diagonal dots' },
    ],
  },
  {
    category: 'Matrices & Arrays',
    items: [
      { cmd: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',   label: 'Matrix with ( )' },
      { cmd: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',   label: 'Matrix with [ ]' },
      { cmd: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',   label: 'Determinant | |' },
      { cmd: '\\begin{cases} x & \\text{if } x>0 \\\\ -x & \\text{otherwise} \\end{cases}', label: 'Piecewise / Cases' },
    ],
  },
];

const QUICK_TEMPLATES = [
  { label: 'x²', cmd: 'x^{2}' },
  { label: 'a/b', cmd: '\\frac{a}{b}' },
  { label: '√x', cmd: '\\sqrt{x}' },
  { label: 'α', cmd: '\\alpha' },
  { label: 'β', cmd: '\\beta' },
  { label: 'π', cmd: '\\pi' },
  { label: '∑', cmd: '\\sum_{i=1}^{n}' },
  { label: '∫', cmd: '\\int_{a}^{b}' },
  { label: '≠', cmd: '\\neq' },
  { label: '≤', cmd: '\\leq' },
  { label: '≥', cmd: '\\geq' },
  { label: '±', cmd: '\\pm' },
  { label: '∞', cmd: '\\infty' },
  { label: '→', cmd: '\\rightarrow' },
  { label: '⇒', cmd: '\\Rightarrow' },
  { label: '×', cmd: '\\times' },
];

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
  enableLaTeX = true,
  onToggleLaTeX = null,
}) => {
  const textareaRef = useRef(null);
  const [showLaTeXMenu, setShowLaTeXMenu] = useState(false);
  const [latexEnabled, setLatexEnabled] = useState(enableLaTeX !== undefined ? enableLaTeX : false);
  const [menuTab, setMenuTab] = useState('symbols');
  const [helpSearch, setHelpSearch] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(null);
  const helpSearchRef = useRef(null);
  const [openCategory, setOpenCategory] = useState(null);

  useEffect(() => {
    if (enableLaTeX !== undefined) {
      setLatexEnabled(enableLaTeX);
    }
  }, [enableLaTeX]);

  useEffect(() => {
    if (showLaTeXMenu && menuTab === 'help' && helpSearchRef.current) {
      helpSearchRef.current.focus();
    }
  }, [showLaTeXMenu, menuTab]);

  const filteredReference = useMemo(() => {
    if (!helpSearch.trim()) return LATEX_REFERENCE;
    const q = helpSearch.toLowerCase();
    return LATEX_REFERENCE.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (it) => it.cmd.toLowerCase().includes(q) || it.label.toLowerCase().includes(q) || cat.category.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [helpSearch]);

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
    }, 0);
  };

  const insertLaTeX = (template) => {
    insertText(`$${template}$`);
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

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return undefined;

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        setShowLaTeXMenu((open) => !open);
      }
    };

    textarea.addEventListener('keydown', handleKeyDown);
    return () => {
      textarea.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
        <>
        <div className="latex-editor-toolbar">
          <div className="toolbar-group">
            <button type="button" className="toolbar-btn" onClick={() => wrapSelection('**', '**')} title="Bold (Ctrl+B)">
              <Bold size={16} />
            </button>
            <button type="button" className="toolbar-btn" onClick={() => wrapSelection('*', '*')} title="Italic (Ctrl+I)">
              <Italic size={16} />
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Math quick-insert */}
          <button
            type="button"
            className={`toolbar-btn toolbar-btn-primary ${showLaTeXMenu ? 'active' : ''}`}
            onClick={() => { setShowLaTeXMenu((p) => !p); setOpenCategory(null); }}
            title="Quick math symbols (Ctrl+M)"
          >
            <Code size={16} />
            <span>Math</span>
          </button>

          <div className="toolbar-divider" />

          {/* Category pills */}
          <div className="toolbar-categories">
            {LATEX_REFERENCE.map((cat) => (
              <button
                key={cat.category}
                type="button"
                className={`toolbar-cat-btn ${openCategory === cat.category ? 'active' : ''}`}
                onClick={() => {
                  setOpenCategory((prev) => prev === cat.category ? null : cat.category);
                  setShowLaTeXMenu(false);
                }}
              >
                {cat.category}
              </button>
            ))}
          </div>

          <div className="toolbar-divider" />

          {/* Help & Reference */}
          <button
            type="button"
            className={`toolbar-btn toolbar-btn-help ${showLaTeXMenu && menuTab === 'help' ? 'active' : ''}`}
            onClick={() => {
              setOpenCategory(null);
              if (showLaTeXMenu && menuTab === 'help') {
                setShowLaTeXMenu(false);
              } else {
                setShowLaTeXMenu(true);
                setMenuTab('help');
              }
            }}
            title="Search all LaTeX commands"
          >
            <BookOpen size={16} />
            <span>Help</span>
          </button>
        </div>

        {/* ── Dropdown panels ── */}
        <div className="latex-panel-anchor">
          {/* Quick Math panel */}
          {showLaTeXMenu && menuTab !== 'help' && (
            <div className="latex-menu latex-menu--inline">
              <div className="latex-menu-bar">
                <span className="latex-menu-bar-title">Quick Insert</span>
                <button type="button" className="latex-menu-close" onClick={() => setShowLaTeXMenu(false)}>×</button>
              </div>
              <div className="latex-menu-content">
                <div className="latex-quick-insert">
                  {QUICK_TEMPLATES.map((t) => (
                    <button key={t.cmd} type="button" className="latex-quick-btn" onClick={() => insertLaTeX(t.cmd)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="latex-menu-help">
                  <strong>Tip:</strong> Use <code>$...$</code> for inline math or <code>$$...$$</code> for block math.
                </div>
              </div>
            </div>
          )}

          {/* Category panel */}
          {openCategory && (() => {
            const cat = LATEX_REFERENCE.find((c) => c.category === openCategory);
            if (!cat) return null;
            return (
              <div className="latex-menu latex-menu--inline">
                <div className="latex-menu-bar">
                  <span className="latex-menu-bar-title">{cat.category}</span>
                  <button type="button" className="latex-menu-close" onClick={() => setOpenCategory(null)}>×</button>
                </div>
                <div className="latex-menu-content">
                  <div className="latex-help-grid">
                    {cat.items.map((item) => (
                      <button
                        key={item.cmd}
                        type="button"
                        className="latex-help-item"
                        onClick={() => insertLaTeX(item.cmd)}
                        title={`Click to insert: ${item.cmd}`}
                      >
                        <code className="latex-help-cmd">{item.cmd}</code>
                        <span className="latex-help-label">{item.label}</span>
                        <span
                          className="latex-help-copy"
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(item.cmd);
                            setCopiedCmd(item.cmd);
                            setTimeout(() => setCopiedCmd(null), 1200);
                          }}
                          title="Copy command"
                        >
                          {copiedCmd === item.cmd ? <Check size={12} /> : <Copy size={12} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Help & Reference panel */}
          {showLaTeXMenu && menuTab === 'help' && (
            <div className="latex-menu latex-menu--inline">
              <div className="latex-menu-bar">
                <span className="latex-menu-bar-title"><BookOpen size={14} /> Help &amp; Reference</span>
                <button type="button" className="latex-menu-close" onClick={() => setShowLaTeXMenu(false)}>×</button>
              </div>
              <div className="latex-menu-content latex-help-content">
                <div className="latex-help-search">
                  <Search size={16} />
                  <input
                    ref={helpSearchRef}
                    type="text"
                    value={helpSearch}
                    onChange={(e) => setHelpSearch(e.target.value)}
                    placeholder="Search commands…  e.g. fraction, alpha, arrow"
                  />
                  {helpSearch && (
                    <button type="button" className="latex-help-search-clear" onClick={() => setHelpSearch('')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="latex-help-body">
                  {filteredReference.length === 0 ? (
                    <div className="latex-help-empty">No commands match &ldquo;{helpSearch}&rdquo;</div>
                  ) : (
                    filteredReference.map((cat) => (
                      <div key={cat.category} className="latex-help-category">
                        <div className="latex-menu-title">{cat.category}</div>
                        <div className="latex-help-grid">
                          {cat.items.map((item) => (
                            <button
                              key={item.cmd}
                              type="button"
                              className="latex-help-item"
                              onClick={() => insertLaTeX(item.cmd)}
                              title={`Click to insert: ${item.cmd}`}
                            >
                              <code className="latex-help-cmd">{item.cmd}</code>
                              <span className="latex-help-label">{item.label}</span>
                              <span
                                className="latex-help-copy"
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(item.cmd);
                                  setCopiedCmd(item.cmd);
                                  setTimeout(() => setCopiedCmd(null), 1200);
                                }}
                                title="Copy command"
                              >
                                {copiedCmd === item.cmd ? <Check size={12} /> : <Copy size={12} />}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="latex-menu-help">
                  <strong>How to use:</strong> Click any command to insert it wrapped in <code>$...$</code>.
                  Or copy the command and paste it manually inside <code>$</code> or <code>$$</code> delimiters.
                </div>
              </div>
            </div>
          )}
        </div>
        </>
      )}

      <textarea
        ref={textareaRef}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
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
