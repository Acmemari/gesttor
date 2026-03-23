import { describe, it, expect } from 'vitest';
import { checkPermission, checkLimit } from '../../../../lib/auth/permissions';
import { User } from '../../../../types';

describe('checkPermission', () => {
  it('should return false for null user', () => {
    expect(checkPermission(null, 'Calculadora')).toBe(false);
  });

  it('should return false for user without plan', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
    };
    expect(checkPermission(user, 'Calculadora')).toBe(false);
  });

  it('should return true for admin user', () => {
    const user: User = {
      id: '1',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      plan: 'essencial',
    };
    expect(checkPermission(user, 'Any Feature')).toBe(true);
  });

  it('should return true for essencial plan with Calculadora feature', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'essencial',
    };
    expect(checkPermission(user, 'Calculadora')).toBe(true);
  });

  it('should return true for gestor plan with wildcard feature', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'gestor',
    };
    // Gestor plan has "Todos os Agentes" feature
    expect(checkPermission(user, 'Any Feature')).toBe(true);
  });

  it('should return true for pro plan', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'pro',
    };
    expect(checkPermission(user, 'Any Feature')).toBe(true);
  });

  it('should return false for essencial plan without feature', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'essencial',
    };
    expect(checkPermission(user, 'Tendências')).toBe(false);
  });
});

describe('checkLimit', () => {
  it('should return false for null user', () => {
    expect(checkLimit(null, 'agents', 1)).toBe(false);
  });

  it('should return false for user without plan', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
    };
    expect(checkLimit(user, 'agents', 1)).toBe(false);
  });

  it('should return true for admin user', () => {
    const user: User = {
      id: '1',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      plan: 'essencial',
    };
    expect(checkLimit(user, 'agents', 999)).toBe(true);
  });

  it('should return true when within limit', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'essencial',
    };
    // Essencial plan has 1 agent limit
    expect(checkLimit(user, 'agents', 0)).toBe(true);
  });

  it('should return false when at or over limit', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'essencial',
    };
    // Essencial plan has 1 agent limit
    expect(checkLimit(user, 'agents', 1)).toBe(false);
    expect(checkLimit(user, 'agents', 2)).toBe(false);
  });

  it('should check historyDays limit', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'essencial',
    };
    // Essencial plan has 7 days limit
    expect(checkLimit(user, 'historyDays', 6)).toBe(true);
    expect(checkLimit(user, 'historyDays', 7)).toBe(false);
  });

  it('should check users limit', () => {
    const user: User = {
      id: '1',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      plan: 'gestor',
    };
    // Gestor plan has 3 users limit
    expect(checkLimit(user, 'users', 2)).toBe(true);
    expect(checkLimit(user, 'users', 3)).toBe(false);
  });
});
