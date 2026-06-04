/**
 * Profile field helpers — only expose and allow safe self-service updates.
 */

const HTTPS_URL_MAX = 2048;

/** Pull direct image URL from Bing/Google image search links (?mediaurl=, ?cdnurl=, etc.) */
function tryExtractEmbeddedImageUrl(raw) {
  try {
    const u = new URL(raw);
    for (const key of ['mediaurl', 'cdnurl', 'imgurl', 'url']) {
      const param = u.searchParams.get(key);
      if (!param) continue;
      const decoded = decodeURIComponent(param.replace(/\+/g, ' '));
      if (decoded.startsWith('https://') || decoded.startsWith('http://')) {
        return decoded.startsWith('http://') ? decoded.replace(/^http:/, 'https:') : decoded;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isImageSearchPageUrl(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.includes('bing.com') && (path.includes('/images/search') || path.includes('/images/async'))) {
      return true;
    }
    if ((host.includes('google.com') || host.includes('google.co')) && path.includes('/imgres')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function looksLikeDirectImageUrl(urlString) {
  try {
    const u = new URL(urlString);
    const path = u.pathname.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(path)) return true;
    const host = u.hostname.toLowerCase();
    if (
      host.includes('th.bing.com') ||
      host.includes('i.imgur.com') ||
      host.includes('images.unsplash.com') ||
      host.includes('gravatar.com')
    ) {
      return true;
    }
    if (path.includes('/wp-content/uploads/') || path.includes('/uploads/')) return true;
  } catch {
    return false;
  }
  return false;
}

export function sanitizeProfileImageUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return { error: 'Profile image URL must be a string' };
  let trimmed = value.trim();
  if (!trimmed) return null;

  if (isImageSearchPageUrl(trimmed)) {
    const extracted = tryExtractEmbeddedImageUrl(trimmed);
    if (!extracted) {
      return {
        error:
          'That is a Bing/Google search page link. Right-click the image → “Copy image address”, or use the direct .jpg/.png link.',
      };
    }
    trimmed = extracted;
  }

  if (trimmed.length > HTTPS_URL_MAX) {
    return { error: 'Profile image URL is too long (max 2048 characters)' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'Profile image URL must be a valid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'Profile image URL must use HTTPS (https://…)' };
  }

  if (!looksLikeDirectImageUrl(trimmed)) {
    return {
      error:
        'Use a direct link to an image file (e.g. https://…/photo.jpg). Search result page URLs will not work as avatars.',
    };
  }

  return trimmed;
}

export function sanitizeText(value, { maxLen = 200, label = 'Field' } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return { error: `${label} must be text` };
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return { error: `${label} is too long` };
  return trimmed || null;
}

export function getEditableFields(actorType, role = null) {
  if (actorType === 'User') {
    return ['fullName', 'phone', 'profileImageUrl'];
  }
  if (actorType === 'OrgUser') {
    if (role === 'OrgAdmin') {
      return ['fullName', 'phone'];
    }
    return ['fullName', 'phone', 'profileImageUrl'];
  }
  if (actorType === 'Student') {
    return ['fullName', 'phone', 'profileImageUrl', 'address', 'fatherName', 'gender', 'dateOfBirth'];
  }
  return [];
}

export function mapUserProfile(row) {
  return {
    actorType: 'User',
    id: row.UserID,
    fullName: row.FullName,
    email: row.Email,
    phone: row.Phone ?? null,
    profileImageUrl: row.ProfileImageURL ?? null,
    role: row.Role,
    status: row.Status,
    lastLogin: row.LastLogin ?? null,
    createdAt: row.CreatedAt,
  };
}

export function mapOrgUserProfile(row, organization = null) {
  const orgEmail = organization?.OrgEmail ?? null;
  const orgPhone = organization?.Phone ?? null;
  const userPhone = row.Phone ?? null;
  const isOrgAdmin = row.Role === 'OrgAdmin';

  return {
    actorType: 'OrgUser',
    id: row.OrgUserID,
    fullName: row.FullName,
    email: row.Email,
    phone: userPhone,
    profileImageUrl: row.ProfileImageURL ?? null,
    role: row.Role,
    status: row.Status,
    orgId: row.OrgID,
    orgName: organization?.OrgName ?? null,
    organizationEmail: orgEmail,
    organizationPhone: orgPhone,
    /** OrgAdmin portal: same login as organization — show org contact fields */
    displayEmail: isOrgAdmin ? orgEmail || row.Email : row.Email,
    displayPhone: isOrgAdmin ? orgPhone || userPhone : userPhone,
    isOrgAdmin,
    lastLogin: row.LastLogin ?? null,
    createdAt: row.CreatedAt,
  };
}

export function mapStudentProfile(row, organization = null) {
  return {
    actorType: 'Student',
    id: row.StudentID,
    fullName: row.FullName,
    email: row.Email,
    phone: row.Phone ?? null,
    profileImageUrl: row.ProfileImageURL ?? null,
    role: 'Student',
    status: row.Status,
    orgId: row.OrgID ?? null,
    orgName: organization?.OrgName ?? null,
    address: row.Address ?? null,
    fatherName: row.FatherName ?? null,
    gender: row.Gender ?? null,
    dateOfBirth: row.DateOfBirth ?? null,
    lastLogin: row.LastLogin ?? null,
    createdAt: row.CreatedAt,
  };
}
