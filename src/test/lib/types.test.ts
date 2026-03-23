import { describe, it, expect } from 'vitest';
import type {
  CattleCalculatorInputs,
  CalculationResults,
  Agent,
  ChatMessage,
  User,
  Plan,
  Organization,
} from '../../../types';

describe('Types - Interface Validation', () => {
  describe('CattleCalculatorInputs', () => {
    it('should accept valid input structure', () => {
      const validInput: CattleCalculatorInputs = {
        pesoCompra: 300,
        valorCompra: 14.5,
        pesoAbate: 510,
        rendimentoCarcaca: 52,
        valorVenda: 280,
        gmd: 0.85,
        custoMensal: 135,
        lotacao: 2.0,
      };

      expect(validInput.pesoCompra).toBe(300);
      expect(validInput.valorCompra).toBe(14.5);
      expect(typeof validInput.pesoCompra).toBe('number');
    });
  });

  describe('CalculationResults', () => {
    it('should accept valid results structure', () => {
      const validResults: CalculationResults = {
        pesoCompraArrobas: 10,
        pesoFinalArrobas: 17.68,
        arrobasProduzidas: 7.68,
        diasPermanencia: 247,
        mesesPermanencia: 8.23,
        valorBoi: 4950.4,
        custoCompra: 4350,
        custoOperacional: 1111.05,
        custoTotal: 5461.05,
        resultadoPorBoi: -510.65,
        margemVenda: -10.31,
        resultadoMensal: -1.17,
        resultadoAnual: -14.04,
        custoPorArrobaProduzida: 144.67,
        custoPorArrobaFinal: 308.75,
        giroEstoque: 145.75,
        producaoArrobaPorHa: 12.5,
        resultadoPorArrobaFinal: -28.75,
        resultadoPorHectareAno: -359.38,
      };

      expect(typeof validResults.resultadoPorBoi).toBe('number');
      expect(typeof validResults.margemVenda).toBe('number');
    });
  });

  describe('Agent', () => {
    it('should accept valid agent structure', () => {
      const validAgent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test description',
        icon: 'calculator',
        category: 'financeiro',
        status: 'active',
      };

      expect(['financeiro', 'zootecnico', 'mercado', 'consultoria', 'admin']).toContain(validAgent.category);
      expect(['active', 'dev', 'planned', 'locked']).toContain(validAgent.status);
    });
  });

  describe('ChatMessage', () => {
    it('should accept valid message structure', () => {
      const validMessage: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        text: 'Test message',
        timestamp: new Date(),
      };

      expect(['user', 'model']).toContain(validMessage.role);
      expect(validMessage.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('User', () => {
    it('should accept valid user structure', () => {
      const validUser: User = {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'client',
        plan: 'essencial',
        status: 'active',
      };

      expect(['admin', 'client']).toContain(validUser.role);
      if (validUser.plan) {
        expect(['essencial', 'gestor', 'pro']).toContain(validUser.plan);
      }
    });
  });

  describe('Plan', () => {
    it('should accept valid plan structure', () => {
      const validPlan: Plan = {
        id: 'gestor',
        name: 'Gestor',
        price: 97,
        features: ['Feature 1', 'Feature 2'],
        limits: {
          agents: 5,
          historyDays: 365,
          users: 3,
        },
      };

      expect(['essencial', 'gestor', 'pro']).toContain(validPlan.id);
      expect(validPlan.limits).toHaveProperty('agents');
      expect(validPlan.limits).toHaveProperty('historyDays');
      expect(validPlan.limits).toHaveProperty('users');
    });
  });

  describe('Organization', () => {
    it('should accept valid organization structure', () => {
      const validOrg: Organization = {
        id: 'org-1',
        name: 'Test Org',
        plan: 'gestor',
        ownerId: 'user-1',
        createdAt: new Date().toISOString(),
      };

      expect(['essencial', 'gestor', 'pro']).toContain(validOrg.plan);
    });
  });
});
