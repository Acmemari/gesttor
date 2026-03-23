import { describe, it, expect } from 'vitest';
import { mapUserProfile } from '../../../../lib/auth/mapUserProfile';

describe('mapUserProfile', () => {
  it('should return null for null/undefined profile', () => {
    expect(mapUserProfile(null)).toBeNull();
    expect(mapUserProfile(undefined as any)).toBeNull();
  });

  it('should map profile correctly', () => {
    const profile = {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'client',
      avatar: 'T',
      plan: 'pro',
      status: 'active',
      last_login: '2024-01-01T00:00:00Z',
      organization_id: 'org-123',
    };

    const result = mapUserProfile(profile);
    expect(result).toEqual({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'client',
      avatar: 'T',
      plan: 'pro',
      status: 'active',
      lastLogin: '2024-01-01T00:00:00.000Z',
      organizationId: 'org-123',
      clientId: undefined,
      phone: undefined,
      qualification: 'visitante',
    });
  });

  it('should handle missing optional fields', () => {
    const profile = {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'admin',
    };

    const result = mapUserProfile(profile);
    expect(result).toEqual({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'admin',
      avatar: 'T',
      plan: undefined,
      status: undefined,
      lastLogin: undefined,
      organizationId: undefined,
      clientId: undefined,
      phone: undefined,
      qualification: 'visitante',
    });
  });

  it('should convert last_login to ISO string', () => {
    const profile = {
      id: 'user-123',
      name: 'Test',
      email: 'test@example.com',
      role: 'client',
      last_login: '2024-01-01T00:00:00Z',
    };

    const result = mapUserProfile(profile);
    expect(result?.lastLogin).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should infer qualification=cliente when organization_id exists and qualification is null', () => {
    const profile = {
      id: 'user-123',
      name: 'Cliente Teste',
      email: 'cliente@example.com',
      role: 'client',
      organization_id: 'client-uuid-999',
      qualification: null,
    };

    const result = mapUserProfile(profile);
    expect(result?.qualification).toBe('cliente');
    expect(result?.organizationId).toBe('client-uuid-999');
  });

  it('should infer qualification=cliente when organization_id exists and qualification is undefined', () => {
    const profile = {
      id: 'user-456',
      name: 'Cliente Sem Qual',
      email: 'csq@example.com',
      role: 'client',
      organization_id: 'client-uuid-888',
    };

    const result = mapUserProfile(profile);
    expect(result?.qualification).toBe('cliente');
    expect(result?.organizationId).toBe('client-uuid-888');
  });

  it('should infer qualification=cliente when organization_id exists and qualification is invalid', () => {
    const profile = {
      id: 'user-789',
      name: 'Cliente Inválido',
      email: 'ci@example.com',
      role: 'client',
      organization_id: 'client-uuid-777',
      qualification: 'unknown_value',
    };

    const result = mapUserProfile(profile);
    expect(result?.qualification).toBe('cliente');
  });

  it('should keep qualification=visitante when organization_id is absent and qualification is null', () => {
    const profile = {
      id: 'user-111',
      name: 'Visitante',
      email: 'v@example.com',
      role: 'client',
      qualification: null,
    };

    const result = mapUserProfile(profile);
    expect(result?.qualification).toBe('visitante');
    expect(result?.organizationId).toBeUndefined();
  });

  it('should expose organizationId when organization_id is present', () => {
    const profile = {
      id: 'user-222',
      name: 'Com OrganizationId',
      email: 'cc@example.com',
      role: 'client',
      organization_id: 'abc-123',
      qualification: 'cliente',
    };

    const result = mapUserProfile(profile);
    expect(result?.organizationId).toBe('abc-123');
    expect(result?.qualification).toBe('cliente');
  });
});
