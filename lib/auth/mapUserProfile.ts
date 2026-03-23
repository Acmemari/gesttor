import { User } from '../../types';
import { logger } from '../logger';

const log = logger.withContext({ component: 'mapUserProfile' });

/**
 * Perfil retornado pela API /api/auth (tabela user_profiles do Neon).
 * role: 'administrador' | 'analista' | 'cliente' | 'visitante'
 * client_id é preenchido pelo endpoint GET /api/auth para role='cliente'.
 */
interface NeonProfile {
  id: string;
  email: string;
  name?: string;
  role?: string;
  plan?: string;
  status?: string;
  avatar?: string;
  imageUrl?: string | null;   // camelCase — retornado pelo Drizzle ORM
  image_url?: string | null;  // snake_case — compatibilidade legado
  lastLogin?: string;         // camelCase — retornado pelo Drizzle ORM
  last_login?: string;        // snake_case — compatibilidade legado
  phone?: string;
  client_id?: string | null;  // preenchido pela API GET /api/auth para role='cliente'
}

/**
 * Deriva (role, qualification) da app a partir do role armazenado no Neon.
 *   administrador → role='admin', qualification='analista'
 *   analista      → role='client', qualification='analista'
 *   cliente       → role='client', qualification='cliente'
 *   visitante     → role='client', qualification='visitante'
 */
function deriveRoleAndQualification(dbRole: string): {
  role: 'admin' | 'client';
  qualification: 'visitante' | 'cliente' | 'analista' | 'administrador';
} {
  switch (dbRole.toLowerCase()) {
    case 'administrador':
      return { role: 'admin', qualification: 'administrador' };
    case 'analista':
      return { role: 'client', qualification: 'analista' };
    case 'cliente':
      return { role: 'client', qualification: 'cliente' };
    default:
      return { role: 'client', qualification: 'visitante' };
  }
}

export const mapUserProfile = (input: unknown): User | null => {
  if (!input || typeof input !== 'object') {
    log.warn('Invalid profile: profile is null, undefined, or not an object');
    return null;
  }

  const profile = input as NeonProfile;

  if (!profile.id) {
    log.warn('Invalid profile: missing id');
    return null;
  }

  if (!profile.email || typeof profile.email !== 'string') {
    log.warn('Invalid profile: missing or invalid email');
    return null;
  }

  const { role, qualification } = deriveRoleAndQualification(profile.role ?? 'visitante');

  const validPlans = ['essencial', 'gestor', 'pro'] as const;
  let plan: 'essencial' | 'gestor' | 'pro' | undefined = undefined;
  if (profile.plan) {
    if (validPlans.includes(profile.plan as (typeof validPlans)[number])) {
      plan = profile.plan as 'essencial' | 'gestor' | 'pro';
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

  const rawLastLogin = profile.lastLogin ?? profile.last_login;
  let lastLogin: string | undefined = undefined;
  if (rawLastLogin) {
    try {
      const date = new Date(rawLastLogin);
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

  const rawImageUrl = profile.imageUrl ?? profile.image_url;
  const imageUrl = rawImageUrl && typeof rawImageUrl === 'string' ? rawImageUrl : null;
  const avatar =
    imageUrl ||
    (profile.avatar && typeof profile.avatar === 'string' && profile.avatar.startsWith('http')
      ? profile.avatar
      : (profile.avatar as string) || name.charAt(0).toUpperCase());

  const phone = profile.phone && typeof profile.phone === 'string' ? profile.phone : undefined;

  return {
    id: String(profile.id),
    name,
    email: profile.email.trim().toLowerCase(),
    role,
    avatar,
    plan,
    status,
    lastLogin,
    phone,
    qualification,
    clientId: profile.client_id ?? undefined,
  };
};
