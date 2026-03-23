import { describe, it, expect } from 'vitest';
import { PLANS } from '../../../constants';
import { Plan } from '../../../types';

describe('Constants - PLANS', () => {
  it('should have three plans defined', () => {
    expect(PLANS).toHaveLength(3);
  });

  it('should have essencial plan with correct structure', () => {
    const essencialPlan = PLANS.find(p => p.id === 'essencial');
    expect(essencialPlan).toBeDefined();
    expect(essencialPlan?.name).toBe('Essencial');
    expect(essencialPlan?.price).toBe(0);
    expect(essencialPlan?.features).toBeInstanceOf(Array);
    expect(essencialPlan?.limits).toBeDefined();
  });

  it('should have gestor plan with correct structure', () => {
    const gestorPlan = PLANS.find(p => p.id === 'gestor');
    expect(gestorPlan).toBeDefined();
    expect(gestorPlan?.name).toBe('Gestor');
    expect(gestorPlan?.price).toBe(97);
    expect(gestorPlan?.features).toBeInstanceOf(Array);
    expect(gestorPlan?.limits).toBeDefined();
  });

  it('should have pro plan with correct structure', () => {
    const proPlan = PLANS.find(p => p.id === 'pro');
    expect(proPlan).toBeDefined();
    expect(proPlan?.name).toBe('Pró');
    expect(proPlan?.price).toBe(299);
    expect(proPlan?.features).toBeInstanceOf(Array);
    expect(proPlan?.limits).toBeDefined();
  });

  it('should have valid plan IDs', () => {
    PLANS.forEach(plan => {
      expect(['essencial', 'gestor', 'pro']).toContain(plan.id);
    });
  });

  it('should have limits with all required fields', () => {
    PLANS.forEach(plan => {
      expect(plan.limits).toHaveProperty('agents');
      expect(plan.limits).toHaveProperty('historyDays');
      expect(plan.limits).toHaveProperty('users');
      expect(typeof plan.limits.agents).toBe('number');
      expect(typeof plan.limits.historyDays).toBe('number');
      expect(typeof plan.limits.users).toBe('number');
    });
  });

  it('should have features as array of strings', () => {
    PLANS.forEach(plan => {
      expect(plan.features).toBeInstanceOf(Array);
      plan.features.forEach(feature => {
        expect(typeof feature).toBe('string');
        expect(feature.length).toBeGreaterThan(0);
      });
    });
  });

  it('should have increasing limits from essencial to pro', () => {
    const essencial = PLANS.find(p => p.id === 'essencial')!;
    const gestor = PLANS.find(p => p.id === 'gestor')!;
    const pro = PLANS.find(p => p.id === 'pro')!;

    expect(gestor.limits.agents).toBeGreaterThan(essencial.limits.agents);
    expect(pro.limits.agents).toBeGreaterThan(gestor.limits.agents);

    expect(gestor.limits.historyDays).toBeGreaterThan(essencial.limits.historyDays);
    expect(pro.limits.historyDays).toBeGreaterThan(gestor.limits.historyDays);

    expect(gestor.limits.users).toBeGreaterThan(essencial.limits.users);
    expect(pro.limits.users).toBeGreaterThan(gestor.limits.users);
  });
});
