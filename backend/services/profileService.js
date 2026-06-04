import { supabase } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  getEditableFields,
  mapOrgUserProfile,
  mapStudentProfile,
  mapUserProfile,
  sanitizeProfileImageUrl,
  sanitizeText,
} from '../utils/profileHelpers.js';
import { isSupabaseConnectivityError } from '../utils/supabaseErrors.js';
import { resolveOrgUserLastLogin } from '../utils/lastLogin.js';

export const GENDERS = ['Male', 'Female', 'Other'];

const ORG_USER_SELECT =
  'OrgUserID, OrgID, FullName, Email, Phone, Role, Status, ProfileImageURL, CreatedAt, LastLogin';
const ORG_USER_SELECT_NO_AVATAR =
  'OrgUserID, OrgID, FullName, Email, Phone, Role, Status, CreatedAt, LastLogin';
const ORG_USER_SELECT_MINIMAL =
  'OrgUserID, OrgID, FullName, Email, Phone, Role, Status, CreatedAt';

export function getProfileMeta(profile) {
  const actorType = profile?.actorType;
  const role = profile?.role ?? null;
  return {
    editable: getEditableFields(actorType, role),
    readOnly: [
      'email',
      'role',
      'status',
      'id',
      'actorType',
      'orgId',
      'orgName',
      'createdAt',
      'lastLogin',
      'displayEmail',
      'displayPhone',
      'organizationEmail',
      'organizationPhone',
      'isOrgAdmin',
    ],
  };
}

async function fetchOrganization(orgId) {
  if (!orgId) return null;
  const { data } = await supabase
    .from('Organizations')
    .select('OrgID, OrgName, OrgEmail, Phone, Address, Status')
    .eq('OrgID', orgId)
    .single();
  return data;
}

export async function loadProfile(user) {
  const { actorType, userId, orgUserId, studentId } = user;

  if (actorType === 'User' && userId) {
    const { data, error } = await supabase
      .from('Users')
      .select('UserID, FullName, Email, Phone, Role, Status, ProfileImageURL, CreatedAt, LastLogin')
      .eq('UserID', userId)
      .single();
    if (error) {
      if (isSupabaseConnectivityError(error)) return { connectivityError: error };
      return { notFound: true };
    }
    return { profile: mapUserProfile(data) };
  }

  if (actorType === 'OrgUser' && orgUserId) {
    let { data, error } = await supabase
      .from('OrgUsers')
      .select(ORG_USER_SELECT)
      .eq('OrgUserID', orgUserId)
      .single();

    if (error?.message?.includes('ProfileImageURL')) {
      const retry = await supabase
        .from('OrgUsers')
        .select(ORG_USER_SELECT_NO_AVATAR)
        .eq('OrgUserID', orgUserId)
        .single();
      data = retry.data ? { ...retry.data, ProfileImageURL: null } : null;
      error = retry.error;
    }
    if (error?.message?.includes('LastLogin')) {
      const retry = await supabase
        .from('OrgUsers')
        .select(ORG_USER_SELECT_MINIMAL)
        .eq('OrgUserID', orgUserId)
        .single();
      data = retry.data
        ? { ...retry.data, ProfileImageURL: data?.ProfileImageURL ?? null, LastLogin: null }
        : null;
      error = retry.error;
    }

    if (error) {
      if (isSupabaseConnectivityError(error)) return { connectivityError: error };
      return { notFound: true };
    }

    const lastLogin = await resolveOrgUserLastLogin(orgUserId, data.LastLogin ?? null);
    const org = await fetchOrganization(data.OrgID);
    return { profile: mapOrgUserProfile({ ...data, LastLogin: lastLogin }, org) };
  }

  if (actorType === 'Student' && studentId) {
    const { data, error } = await supabase
      .from('Students')
      .select(
        'StudentID, OrgID, FullName, FatherName, Email, Phone, Gender, DateOfBirth, Address, ProfileImageURL, Status, CreatedAt'
      )
      .eq('StudentID', studentId)
      .single();
    if (error) {
      if (isSupabaseConnectivityError(error)) return { connectivityError: error };
      return { notFound: true };
    }
    const org = await fetchOrganization(data.OrgID);
    return { profile: mapStudentProfile(data, org) };
  }

  return { notFound: true };
}

function buildUpdatePayload(actorType, body, role = null) {
  const allowed = new Set(getEditableFields(actorType, role));
  const updates = {};
  const errors = [];

  if (allowed.has('fullName') && body.fullName !== undefined) {
    const v = sanitizeText(body.fullName, { maxLen: 120, label: 'Full name' });
    if (v?.error) errors.push(v.error);
    else if (!v) errors.push('Full name is required');
    else updates.fullName = v;
  }

  if (allowed.has('phone') && body.phone !== undefined) {
    const v = sanitizeText(body.phone, { maxLen: 30, label: 'Phone' });
    if (v?.error) errors.push(v.error);
    else updates.phone = v;
  }

  if (allowed.has('profileImageUrl') && body.profileImageUrl !== undefined) {
    const v = sanitizeProfileImageUrl(body.profileImageUrl);
    if (v?.error) errors.push(v.error);
    else updates.profileImageUrl = v;
  }

  if (allowed.has('address') && body.address !== undefined) {
    const v = sanitizeText(body.address, { maxLen: 300, label: 'Address' });
    if (v?.error) errors.push(v.error);
    else updates.address = v;
  }

  if (allowed.has('fatherName') && body.fatherName !== undefined) {
    const v = sanitizeText(body.fatherName, { maxLen: 120, label: 'Father name' });
    if (v?.error) errors.push(v.error);
    else updates.fatherName = v;
  }

  if (allowed.has('gender') && body.gender !== undefined) {
    if (body.gender === null || body.gender === '') {
      updates.gender = null;
    } else if (!GENDERS.includes(body.gender)) {
      errors.push('Invalid gender');
    } else {
      updates.gender = body.gender;
    }
  }

  if (allowed.has('dateOfBirth') && body.dateOfBirth !== undefined) {
    if (body.dateOfBirth === null || body.dateOfBirth === '') {
      updates.dateOfBirth = null;
    } else {
      const d = new Date(body.dateOfBirth);
      if (Number.isNaN(d.getTime())) errors.push('Invalid date of birth');
      else if (d > new Date()) errors.push('Date of birth cannot be in the future');
      else updates.dateOfBirth = body.dateOfBirth;
    }
  }

  return { updates, errors };
}

function toDbUpdate(actorType, updates) {
  const db = {};
  if (updates.fullName !== undefined) db.FullName = updates.fullName;
  if (updates.phone !== undefined) db.Phone = updates.phone;
  if (updates.profileImageUrl !== undefined) db.ProfileImageURL = updates.profileImageUrl;
  if (actorType === 'Student') {
    if (updates.address !== undefined) db.Address = updates.address;
    if (updates.fatherName !== undefined) db.FatherName = updates.fatherName;
    if (updates.gender !== undefined) db.Gender = updates.gender;
    if (updates.dateOfBirth !== undefined) db.DateOfBirth = updates.dateOfBirth;
  }
  return db;
}

/**
 * @returns {{ ok: true, profile, meta }} | { validationError } | { unsupported } | { connectivityError } | { updateError }
 */
export async function updateProfile(user, body) {
  const { actorType, userId, orgUserId, studentId, role } = user;
  const { updates, errors } = buildUpdatePayload(actorType, body, role);

  if (errors.length) {
    return { validationError: errors };
  }
  if (Object.keys(updates).length === 0) {
    return { validationError: ['No valid fields to update'] };
  }

  const dbUpdate = toDbUpdate(actorType, updates);
  let updateError;

  if (actorType === 'User' && userId) {
    ({ error: updateError } = await supabase.from('Users').update(dbUpdate).eq('UserID', userId));
  } else if (actorType === 'OrgUser' && orgUserId) {
    ({ error: updateError } = await supabase.from('OrgUsers').update(dbUpdate).eq('OrgUserID', orgUserId));
  } else if (actorType === 'Student' && studentId) {
    ({ error: updateError } = await supabase.from('Students').update(dbUpdate).eq('StudentID', studentId));
  } else {
    return { unsupported: true };
  }

  if (updateError) {
    if (isSupabaseConnectivityError(updateError)) {
      return { connectivityError: updateError };
    }
    const msg = updateError.message || '';
    if (msg.includes('ProfileImageURL')) {
      return {
        updateError: {
          status: 400,
          error:
            'Avatar could not be saved. Run backend/db/migrations/002_org_users_profile_image_url.sql in Supabase, or clear the avatar URL field.',
          details: msg,
        },
      };
    }
    return {
      updateError: {
        status: 500,
        error: 'Failed to update profile',
        details: msg,
      },
    };
  }

  const result = await loadProfile(user);
  if (result.connectivityError) return { connectivityError: result.connectivityError };
  if (result.notFound || !result.profile) return { notFound: true };

  return {
    ok: true,
    profile: result.profile,
    meta: getProfileMeta(result.profile),
  };
}

/**
 * @returns {{ ok: true }} | { unsupported } | { notFound } | { wrongPassword } | { samePassword } | { connectivityError } | { updateError }
 */
export async function changeProfilePassword(user, { currentPassword, newPassword }) {
  const { actorType, userId, orgUserId, studentId } = user;

  let table;
  let idColumn;
  let idValue;

  if (actorType === 'User' && userId) {
    table = 'Users';
    idColumn = 'UserID';
    idValue = userId;
  } else if (actorType === 'OrgUser' && orgUserId) {
    table = 'OrgUsers';
    idColumn = 'OrgUserID';
    idValue = orgUserId;
  } else if (actorType === 'Student' && studentId) {
    table = 'Students';
    idColumn = 'StudentID';
    idValue = studentId;
  } else {
    return { unsupported: true };
  }

  const { data: row, error: fetchErr } = await supabase
    .from(table)
    .select('PasswordHash')
    .eq(idColumn, idValue)
    .single();

  if (fetchErr || !row?.PasswordHash) {
    return { notFound: true };
  }

  const valid = await verifyPassword(currentPassword, row.PasswordHash);
  if (!valid) {
    return { wrongPassword: true };
  }

  const same = await verifyPassword(newPassword, row.PasswordHash);
  if (same) {
    return { samePassword: true };
  }

  const passwordHash = await hashPassword(newPassword);
  const { error: updateErr } = await supabase
    .from(table)
    .update({ PasswordHash: passwordHash })
    .eq(idColumn, idValue);

  if (updateErr) {
    if (isSupabaseConnectivityError(updateErr)) {
      return { connectivityError: updateErr };
    }
    return {
      updateError: {
        status: 500,
        error: 'Failed to update password',
        details: updateErr.message,
      },
    };
  }

  return { ok: true };
}
