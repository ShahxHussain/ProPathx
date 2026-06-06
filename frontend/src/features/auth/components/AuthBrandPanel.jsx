import { Link } from 'react-router-dom';
import { getAuthBrandContent } from '../authBrandContent';

export default function AuthBrandPanel({ loginType, mode }) {
  const brand = getAuthBrandContent(loginType, mode);
  const panelKey = `${loginType || 'portal'}-${mode}`;

  return (
    <div className="auth-brand-panel" key={panelKey}>
      <Link to="/" className="auth-brand-chip">
        ProPath
      </Link>
      <div className="auth-brand-lines" aria-hidden>
        <span className="line line-1" />
        <span className="line line-2" />
        <span className="line line-3" />
      </div>
      <h1 className="auth-brand-title">{brand.title}</h1>
      <p className="auth-brand-copy">{brand.copy}</p>
      <p className="auth-brand-highlight">{brand.highlight}</p>
      <ul className="auth-brand-points">
        {brand.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="auth-brand-grid">
        {brand.grid.map((item) => (
          <div key={item.label} className="auth-brand-grid-item">
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>
      <div className="auth-brand-foot">
        {brand.foot.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}
