import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from '../../../agents/AdminDashboard';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { mapUserProfile } from '../../../lib/auth/mapUserProfile';

// Mock dependencies
vi.mock('../../../contexts/AuthContext');
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock data
const mockAdminUser = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin' as const,
  plan: 'pro' as const,
  status: 'active' as const,
};

const mockClientUsers = [
  {
    id: 'client-1',
    name: 'Client One',
    email: 'client1@example.com',
    role: 'client' as const,
    plan: 'gestor' as const,
    status: 'active' as const,
    last_login: '2024-01-15T10:00:00Z',
    organization_id: 'org-1',
    qualification: 'visitante' as const,
  },
  {
    id: 'client-2',
    name: 'Client Two',
    email: 'client2@example.com',
    role: 'client' as const,
    plan: 'pro' as const,
    status: 'active' as const,
    last_login: '2024-01-14T08:00:00Z',
    organization_id: 'org-2',
    qualification: 'cliente' as const,
  },
  {
    id: 'client-3',
    name: 'Client Three',
    email: 'client3@example.com',
    role: 'client' as const,
    plan: 'essencial' as const,
    status: 'inactive' as const,
    last_login: null,
    organization_id: null,
    qualification: 'analista' as const,
  },
];

describe('AdminDashboard Component', () => {
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Supabase mock chain for user_profiles
    mockSelect.mockReturnThis();
    mockEq.mockReturnThis();
    mockOrder.mockResolvedValue({ data: mockClientUsers, error: null });

    // Separate mock for organizations to avoid consuming same mockOrder
    const mockOrgChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'org-1', name: 'Org 1', status: 'active' }],
        error: null,
      }),
    };

    mockFrom.mockImplementation(tableName => {
      if (tableName === 'organizations') return mockOrgChain;
      return {
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
      };
    });

    (supabase.from as any) = mockFrom;

    // Default: mock admin user
    vi.mocked(useAuth).mockReturnValue({
      user: mockAdminUser,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      checkPermission: vi.fn(() => true),
      checkLimit: vi.fn(() => true),
      upgradePlan: vi.fn(),
      isPasswordRecovery: false,
      refreshProfile: vi.fn(),
      resetPassword: vi.fn(),
      updatePassword: vi.fn(),
      clearPasswordRecovery: vi.fn(),
      signInWithOAuth: vi.fn(),
      signup: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Export', () => {
    it('should export component', () => {
      expect(AdminDashboard).toBeDefined();
      expect(typeof AdminDashboard).toBe('function');
    });
  });

  describe('Permission Validation', () => {
    it('should show access denied for non-admin users', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: { ...mockAdminUser, role: 'client' },
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        checkPermission: vi.fn(() => false),
        checkLimit: vi.fn(() => false),
        upgradePlan: vi.fn(),
        isPasswordRecovery: false,
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        clearPasswordRecovery: vi.fn(),
        signInWithOAuth: vi.fn(),
        signup: vi.fn(),
      });

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/acesso negado/i)).toBeInTheDocument();
      });
    });

    it('should load clients when user is admin', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('user_profiles');
        expect(mockSelect).toHaveBeenCalledWith(
          'id, name, email, role, avatar, plan, status, last_login, organization_id, phone, qualification, created_at, updated_at',
        );
        expect(mockEq).toHaveBeenCalledWith('role', 'client');
        expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      render(<AdminDashboard />);
      // Loading state is shown briefly, so we check for the loader
      const loader = screen.queryByRole('status') || document.querySelector('.animate-spin');
      expect(loader || screen.getByText(/carregando/i)).toBeTruthy();
    });
  });

  describe('Data Loading', () => {
    it('should load and display clients successfully', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Client One')).toBeInTheDocument();
        expect(screen.getByText('Client Two')).toBeInTheDocument();
        expect(screen.getByText('Client Three')).toBeInTheDocument();
      });
    });

    it('should display client emails', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('client1@example.com')).toBeInTheDocument();
        expect(screen.getByText('client2@example.com')).toBeInTheDocument();
      });
    });

    it('should handle empty client list', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/nenhum usuário cadastrado/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message on query failure', async () => {
      const errorMessage = 'Permission denied';
      mockOrder.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST301',
          message: errorMessage,
          details: null,
          hint: null,
        },
      });

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/erro de permissão/i)).toBeInTheDocument();
      });
    });

    it('should display generic error message on unknown error', async () => {
      mockOrder.mockResolvedValue({
        data: null,
        error: {
          code: 'UNKNOWN',
          message: 'Something went wrong',
          details: null,
          hint: null,
        },
      });

      render(<AdminDashboard />);

      await waitFor(
        () => {
          expect(screen.getByText(/erro ao carregar usuários/i)).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    });

    it('should show retry button on error', async () => {
      mockOrder.mockResolvedValue({
        data: null,
        error: {
          code: 'UNKNOWN',
          message: 'Error',
          details: null,
          hint: null,
        },
      });

      render(<AdminDashboard />);

      await waitFor(
        () => {
          const retryButton = screen.getByText(/tentar novamente/i);
          expect(retryButton).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    });

    it('should retry loading on retry button click', async () => {
      mockOrder
        .mockResolvedValueOnce({ data: null, error: { code: 'UNKNOWN', message: 'Error' } })
        .mockResolvedValueOnce({ data: null, error: { code: 'UNKNOWN', message: 'Error' } })
        .mockResolvedValueOnce({ data: null, error: { code: 'UNKNOWN', message: 'Error' } })
        .mockResolvedValueOnce({ data: mockClientUsers, error: null });

      render(<AdminDashboard />);

      await waitFor(
        () => {
          expect(screen.getByText(/tentar novamente/i)).toBeInTheDocument();
        },
        { timeout: 4000 },
      );

      const retryButton = screen.getByText(/tentar novamente/i);
      await userEvent.click(retryButton);

      await waitFor(
        () => {
          expect(screen.getByText('Client One')).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    });
  });

  describe('Search Functionality', () => {
    it('should filter clients by name', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Client One')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/buscar usuário/i);
      await userEvent.type(searchInput, 'One');

      await waitFor(() => {
        expect(screen.getByText('Client One')).toBeInTheDocument();
        expect(screen.queryByText('Client Two')).not.toBeInTheDocument();
      });
    });

    it('should filter clients by email', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Client One')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/buscar usuário/i);
      await userEvent.type(searchInput, 'client2@example.com');

      await waitFor(() => {
        expect(screen.getByText('Client Two')).toBeInTheDocument();
        expect(screen.queryByText('Client One')).not.toBeInTheDocument();
      });
    });

    it('should show no results message when search has no matches', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Client One')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/buscar usuário/i);
      await userEvent.type(searchInput, 'NonExistent');

      await waitFor(() => {
        expect(screen.getByText(/nenhum usuário encontrado/i)).toBeInTheDocument();
      });
    });

    it('should be case insensitive', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Client One')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/buscar usuário/i);
      await userEvent.type(searchInput, 'CLIENT ONE');

      await waitFor(() => {
        expect(screen.getByText('Client One')).toBeInTheDocument();
      });
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate total clients correctly', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const totalCard = screen.getByText('Total Usuários').closest('.bg-white');
        expect(within(totalCard as HTMLElement).getByText('3')).toBeInTheDocument();
      });
    });

    it('should calculate active clients correctly', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const activeCard = screen.getByText('Ativos').closest('.bg-white');
        // 2 active clients (client-1 and client-2)
        expect(within(activeCard as HTMLElement).getByText('2')).toBeInTheDocument();
      });
    });
  });

  describe('Client Display', () => {
    it('should display client qualification badges correctly', async () => {
      render(<AdminDashboard />);

      await waitFor(
        () => {
          expect(screen.getByText(/visitante/i)).toBeInTheDocument();
          expect(screen.getByText(/cliente/i)).toBeInTheDocument();
          expect(screen.getByText(/analista/i)).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    });

    it('should display client status correctly', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const activeStatuses = screen.getAllByText('Ativo');
        expect(activeStatuses.length).toBeGreaterThan(0);
        expect(screen.getByText('Inativo')).toBeInTheDocument();
      });
    });

    it('should format last login correctly', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        // Should show formatted dates or "Nunca" for null
        const lastLoginCells = screen.getAllByText(/hoje|ontem|dias atrás|nunca/i);
        expect(lastLoginCells.length).toBeGreaterThan(0);
      });
    });

    it('should display client avatar initials', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        // Check for avatar circles with initials
        const avatars = document.querySelectorAll('.rounded-full');
        expect(avatars.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient errors', async () => {
      let attemptCount = 0;
      mockOrder.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.resolve({
            data: null,
            error: {
              code: 'PGRST500',
              message: 'Server error',
              details: null,
              hint: null,
            },
          });
        }
        return Promise.resolve({ data: mockClientUsers, error: null });
      });

      render(<AdminDashboard />);

      await waitFor(
        () => {
          expect(screen.getByText('Client One')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      expect(attemptCount).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null data response', async () => {
      mockOrder.mockResolvedValue({ data: null, error: null });

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/nenhum usuário cadastrado/i)).toBeInTheDocument();
      });
    });

    it('should handle malformed client data gracefully', async () => {
      const malformedData = [
        { id: 'client-1', email: 'client1@example.com' }, // missing required fields
        null,
        undefined,
      ];

      mockOrder.mockResolvedValue({ data: malformedData, error: null });

      render(<AdminDashboard />);

      // Should not crash, should filter out invalid entries
      await waitFor(() => {
        // Component should render without errors
        expect(screen.getByText(/base de usuários/i)).toBeInTheDocument();
      });
    });

    it('should handle network timeout', async () => {
      mockOrder.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 100)),
      );

      render(<AdminDashboard />);

      await waitFor(
        () => {
          expect(screen.getByText(/^Erro ao carregar dados$/i)).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
    }, 15000);
  });

  describe('Table Display', () => {
    it('should show correct table headers', async () => {
      render(<AdminDashboard />);

      await waitFor(
        () => {
          const table = screen.getByRole('table');
          const thead = table.querySelector('thead');
          if (!thead) throw new Error('Table head not found');

          const headerContainer = within(thead as HTMLElement);
          expect(headerContainer.getByText(/^usuário$/i)).toBeInTheDocument();
          expect(headerContainer.getByText(/^qualificação$/i)).toBeInTheDocument();
          expect(headerContainer.getByText(/^status$/i)).toBeInTheDocument();
          expect(headerContainer.getByText(/^último acesso$/i)).toBeInTheDocument();
          expect(headerContainer.getByText(/^ações$/i)).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    });

    it('should show client count in footer', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/mostrando.*de.*usuários/i)).toBeInTheDocument();
      });
    });
  });
});
