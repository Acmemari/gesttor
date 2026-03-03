import { User } from '../../types';
import { logger } from '../logger';

const log = logger.withContext({ component: 'mapUserProfile' });

interface SupabaseProfile {
  id: string;
  email: string;
  name?: string;
  role?: string;
  plan?: string;
  status?: string;
  avatar?: string;
  last_login?: string;
  organization_id?: string;
  client_id?: string;
  phone?: string;
  qualification?: string | null;
}

export const mapUserProfile = (input: unknown): User | null => {
  if (!input || typeof input !== 'object') {
    log.warn('Invalid profile: profile is null, undefined, or not an object');
    return null;
  }

  const profile = input as SupabaseProfile;

  if (!profile.id) {
    log.warn('Invalid profile: missing id');
    return null;
  }

  if (!profile.email || typeof profile.email !== 'string') {
    log.warn('Invalid profile: missing or invalid email');
    return null;
  }

  const validRoles = ['admin', 'client'] as const;
  const role = profile.role;
  if (!role || !validRoles.includes(role as (typeof validRoles)[number])) {
    log.warn('Invalid profile: missing or invalid role');
    return null;
  }

  const validPlans = ['basic', 'pro', 'enterprise'] as const;
  let plan: 'basic' | 'pro' | 'enterprise' | undefined = undefined;
  if (profile.plan) {
    if (validPlans.includes(profile.plan as (typeof validPlans)[number])) {
      plan = profile.plan as 'basic' | 'pro' | 'enterprise';
    } else {
      log.warn('Invalid plan value, defaulting to undefined');
    }
  }

  const validStatuses = ['active', 'inactive'] as const;
  let status: 'active' | 'inactive' | undefined = undefined;
  if (profile.status) {
    if (validStatuses.includes(profile.status as (typeof validStatuses)[number])) {
      status = profile.status as 'active' | 'inactive';
    } else {
      log.warn('Invalid status value, defaulting to undefined');
    }
  }

  let lastLogin: string | undefined = undefined;
  if (profile.last_login) {
    try {
      const date = new Date(profile.last_login);
      if (!isNaN(date.getTime())) {
        lastLogin = date.toISOString();
      } else {
        log.warn('Invalid last_login date, ignoring');
      }
    } catch {
      log.warn('Error parsing last_login');
    }
  }

  const name =
    profile.name && typeof profile.name === 'string' && profile.name.trim()
      ? profile.name.trim()
      : profile.email.split('@')[0] || 'Usuário';

  const avatar = profile.avatar && typeof profile.avatar === 'string' ? profile.avatar : name.charAt(0).toUpperCase();

  let organizationId: string | undefined = undefined;
  if (profile.organization_id) {
    organizationId = String(profile.organization_id);
  }

  let clientId: string | undefined = undefined;
  if (profile.client_id) {
    clientId = String(profile.client_id);
  }

  const phone = profile.phone && typeof profile.phone === 'string' ? profile.phone : undefined;

  const validQualifications = ['visitante', 'cliente', 'analista'] as const;
  let qualification: 'visitante' | 'cliente' | 'analista' | undefined = undefined;

  if (profile.qualification !== null && profile.qualification !== undefined) {
    const qualValue = String(profile.qualification).trim();
    if (validQualifications.includes(qualValue as (typeof validQualifications)[number])) {
      qualification = qualValue as 'visitante' | 'cliente' | 'analista';
    } else {
      log.warn('Invalid qualification value, defaulting to visitante');
      qualification = 'visitante';
    }
  } else {
    qualification = 'visitante';
  }

  return {
    id: String(profile.id),
    name,
    email: profile.email.trim().toLowerCase(),
    role: role as 'admin' | 'client',
    avatar,
    plan,
    status,
    lastLogin,
    organizationId,
    clientId,
    phone,
    qualification,
  };
};
