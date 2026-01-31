import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { Login } from '../index';

// Mock the API
const mockLogin = vi.fn();
const mockLoginWithTotp = vi.fn();
const mockSetup = vi.fn();

vi.mock('../../../api/client', () => ({
  api: {
    login: (...args: unknown[]) => mockLogin(...args),
    loginWithTotp: (...args: unknown[]) => mockLoginWithTotp(...args),
    setup: (...args: unknown[]) => mockSetup(...args),
  },
}));

// Mock the auth store
const mockSetAuthenticated = vi.fn();
const mockSetError = vi.fn();
const mockSetLoading = vi.fn();
const mockClearError = vi.fn();
const mockSetTotpSetupRequired = vi.fn();

vi.mock('../../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    error: null,
    isLoading: false,
    setAuthenticated: mockSetAuthenticated,
    setError: mockSetError,
    setLoading: mockSetLoading,
    clearError: mockClearError,
    setTotpSetupRequired: mockSetTotpSetupRequired,
  }),
}));

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form by default', () => {
    render(<Login />);

    expect(screen.getByText('Orchestrate Everything')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields on blur', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    // Focus and blur username to trigger validation
    await user.click(usernameInput);
    await user.click(passwordInput);

    // Focus and blur password
    await user.click(usernameInput);

    // Wait for validation errors
    await waitFor(() => {
      // Check for validation messages (depends on schema)
      const errors = screen.queryAllByRole('alert');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it('submits form and calls API with credentials', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'testuser' },
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password123');
    });
  });

  it('navigates to home on successful login', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'testuser' },
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSetAuthenticated).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('transitions to TOTP view when 2FA required', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      totpRequired: true,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter verification code')).toBeInTheDocument();
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });
  });

  it('transitions to setup view when no users exist', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('No users exist'));

    render(<Login />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Create Admin Account')).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });
  });

  it('shows API error messages', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    // Need to update the mock to return the error
    vi.mocked(mockSetError).mockImplementation(() => {});

    render(<Login />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith('Invalid credentials');
    });
  });

  it('TOTP form shows back button to return to login', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      totpRequired: true,
    });

    render(<Login />);

    // Login first
    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter verification code')).toBeInTheDocument();
    });

    // Click back button
    await user.click(screen.getByRole('button', { name: /back to login/i }));

    // Should be back on login view
    expect(screen.getByText('Orchestrate Everything')).toBeInTheDocument();
  });

  it('redirects to 2FA setup when totpSetupRequired', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'admin' },
      totpSetupRequired: true,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSetTotpSetupRequired).toHaveBeenCalledWith(true);
      expect(mockNavigate).toHaveBeenCalledWith('/setup-2fa', { replace: true });
    });
  });
});
