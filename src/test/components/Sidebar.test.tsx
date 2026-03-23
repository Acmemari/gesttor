import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from '../../../components/Sidebar';
import { Agent, User } from '../../../types';
import { LocationProvider } from '../../../contexts/LocationContext';

const mockAgents: Agent[] = [
  {
    id: 'cattle-profit',
    name: 'Calculadoras',
    description: 'Análise econômica completa.',
    icon: 'calculator',
    category: 'financeiro',
    status: 'active',
  },
  {
    id: 'ask-antonio',
    name: 'Pergunte p/ Antonio',
    description: 'Consultor virtual especialista.',
    icon: 'nutrition',
    category: 'consultoria',
    status: 'locked',
  },
];

const mockUser: User = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'client',
  plan: 'essencial',
};

describe('Sidebar', () => {
  const mockOnSelectAgent = vi.fn();
  const mockOnLogout = vi.fn();
  const mockToggleSidebar = vi.fn();

  it('should render sidebar with agents', () => {
    render(
      <LocationProvider>
        <Sidebar
          agents={mockAgents}
          activeAgentId="cattle-profit"
          onSelectAgent={mockOnSelectAgent}
          isOpen={true}
          toggleSidebar={mockToggleSidebar}
          user={mockUser}
          onLogout={mockOnLogout}
        />
      </LocationProvider>,
    );

    expect(screen.getByText(/Gesttor/i)).toBeInTheDocument();
    expect(screen.getByText('Calculadoras')).toBeInTheDocument();
    expect(screen.getByText('Pergunte p/ Antonio')).toBeInTheDocument();
  });

  it('should show user information', () => {
    render(
      <LocationProvider>
        <Sidebar
          agents={mockAgents}
          activeAgentId="cattle-profit"
          onSelectAgent={mockOnSelectAgent}
          isOpen={true}
          toggleSidebar={mockToggleSidebar}
          user={mockUser}
          onLogout={mockOnLogout}
        />
      </LocationProvider>,
    );

    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('should show locked status for locked agents', () => {
    render(
      <LocationProvider>
        <Sidebar
          agents={mockAgents}
          activeAgentId="cattle-profit"
          onSelectAgent={mockOnSelectAgent}
          isOpen={true}
          toggleSidebar={mockToggleSidebar}
          user={mockUser}
          onLogout={mockOnLogout}
        />
      </LocationProvider>,
    );

    const lockedAgent = screen.getByText('Pergunte p/ Antonio').closest('button');
    expect(lockedAgent).toHaveAttribute('disabled');
  });
});
