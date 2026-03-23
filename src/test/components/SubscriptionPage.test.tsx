import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubscriptionPage from '../../../components/SubscriptionPage';
import { User } from '../../../types';

const mockUser: User = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'client',
  plan: 'essencial',
};

describe('SubscriptionPage', () => {
  const mockOnUpgrade = vi.fn();
  const mockOnBack = vi.fn();

  it('should render all plans', () => {
    render(<SubscriptionPage user={mockUser} onUpgrade={mockOnUpgrade} onBack={mockOnBack} />);

    expect(screen.getByText('Essencial')).toBeInTheDocument();
    expect(screen.getByText('Gestor')).toBeInTheDocument();
    expect(screen.getByText('Pró')).toBeInTheDocument();
  });

  it('should highlight current plan', () => {
    render(<SubscriptionPage user={mockUser} onUpgrade={mockOnUpgrade} onBack={mockOnBack} />);

    // Check that "Plano Atual" appears for essencial plan
    const basicPlanSection = screen.getByText('Essencial').closest('div');
    expect(basicPlanSection).toBeInTheDocument();
    // The plan should be marked as current
    expect(screen.getByText('Plano Atual')).toBeInTheDocument();
  });

  it('should show plan prices', () => {
    render(<SubscriptionPage user={mockUser} onUpgrade={mockOnUpgrade} onBack={mockOnBack} />);

    expect(screen.getByText(/R\$ 0/)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 97/)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 299/)).toBeInTheDocument();
  });

  it('should show "Plano Atual" for current plan', () => {
    render(<SubscriptionPage user={mockUser} onUpgrade={mockOnUpgrade} onBack={mockOnBack} />);

    expect(screen.getByText('Plano Atual')).toBeInTheDocument();
  });
});
