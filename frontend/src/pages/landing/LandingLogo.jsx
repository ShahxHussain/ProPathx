import { Link } from 'react-router-dom';
import propathLogo from './assets/Propath_Logo.png';

export default function LandingLogo({ to, size = 'default', onClick, className = '' }) {
  const classes = [
    'landing-logo',
    'landing-logo--image',
    size !== 'default' ? `landing-logo--${size}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const img = (
    <img
      src={propathLogo}
      alt="ProPath"
      className="landing-logo__image"
      decoding="async"
    />
  );

  if (to) {
    return (
      <Link to={to} className={classes} onClick={onClick}>
        {img}
      </Link>
    );
  }

  return <span className={classes}>{img}</span>;
}
