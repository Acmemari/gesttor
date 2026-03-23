import { User, Plan } from '../../types';
import { PLANS } from '../../constants';

/**
 * Verifica se o usuário tem permissão para acessar uma feature
 * @param user Usuário atual
 * @param feature Nome da feature
 * @returns true se tem permissão, false caso contrário
 */
export const checkPermission = (user: User | null, feature: string): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.qualification === 'analista') return true;
  if (!user.plan) return false;

  const userPlan = PLANS.find(p => p.id === user.plan);
  if (!userPlan) return false;

  // Check if feature is in plan features
  const hasWildcard = userPlan.features.some(f => f.toLowerCase().includes('todos os agentes'));
  if (hasWildcard) return true;

  return userPlan.features.some(f => f.toLowerCase().includes(feature.toLowerCase())) || userPlan.id === 'pro';
};

/**
 * Verifica se o usuário está dentro do limite para uma métrica
 * @param user Usuário atual
 * @param limit Tipo de limite
 * @param currentValue Valor atual
 * @returns true se está dentro do limite, false caso contrário
 */
export const checkLimit = (user: User | null, limit: keyof Plan['limits'], currentValue: number): boolean => {
  if (!user || !user.plan) return false;
  if (user.role === 'admin') return true;

  const userPlan = PLANS.find(p => p.id === user.plan);
  if (!userPlan) return false;

  return currentValue < userPlan.limits[limit];
};
