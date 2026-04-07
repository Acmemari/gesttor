import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from '../../../components/ForgotPasswordPage';

const mockResetPassword = vi.fn();

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    resetPassword: mockResetPassword,
  }),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('stores the recovery email locally after a successful request', async () => {
    const user = userEvent.setup();
    mockResetPassword.mockResolvedValue({ success: true });

    render(<ForgotPasswordPage onBack={vi.fn()} onToast={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/exemplo@gesttor.com/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /enviar link de recuperação/i }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('user@example.com');
    });

    expect(window.localStorage.getItem('password_recovery_email')).toBe('user@example.com');
    expect(screen.getByText('Email enviado!')).toBeInTheDocument();
  });
});
