import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../../../components/LoginPage';

// Mock useAuth
const mockLogin = vi.fn();
const mockSignup = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    signup: mockSignup,
    signInWithOAuth: mockSignInWithOAuth,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render login form by default', () => {
    render(<LoginPage />);
    expect(screen.getByText('Acesse sua conta')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/exemplo@gesttor.app/i)).toBeInTheDocument();
  });

  it('should toggle to signup mode', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const signupButton = screen.getByText('Cadastrar');
    await user.click(signupButton);

    expect(screen.getByText('Criar nova conta')).toBeInTheDocument();
  });

  it('should show name field in signup mode', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByText('Cadastrar'));

    expect(screen.getByPlaceholderText(/Seu nome completo/i)).toBeInTheDocument();
  });

  it('should validate password length on signup', async () => {
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.click(screen.getByText('Cadastrar'));

    const nameInput = screen.getByPlaceholderText(/Seu nome completo/i);
    const emailInput = screen.getByPlaceholderText(/exemplo@pecuaria.com/i);
    const passwordInput = screen.getByPlaceholderText(/Mínimo 6 caracteres/i);

    await user.type(nameInput, 'Test User');
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, '12345'); // Less than 6 chars

    const submitButtons = screen.getAllByRole('button', { name: /Cadastrar/i });
    const submitButton = submitButtons[submitButtons.length - 1];

    // Button should be disabled due to validation
    expect(submitButton).toBeDisabled();
  });

  it('should call login on form submit', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(true);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText(/exemplo@pecuaria.com/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i);

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    const submitButtons = screen.getAllByRole('button', { name: /Entrar/i });
    await user.click(submitButtons[submitButtons.length - 1]); // Click the submit button

    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('should show Google OAuth button', () => {
    render(<LoginPage />);
    expect(screen.getByText(/Continuar com Google/i)).toBeInTheDocument();
  });

  it('should call signInWithOAuth when Google button is clicked', async () => {
    const user = userEvent.setup();
    mockSignInWithOAuth.mockResolvedValue({});

    render(<LoginPage />);

    const googleButton = screen.getByText(/Continuar com Google/i);
    await user.click(googleButton);

    expect(mockSignInWithOAuth).toHaveBeenCalledWith('google');
  });
});
