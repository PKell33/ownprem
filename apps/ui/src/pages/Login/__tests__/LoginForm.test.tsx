import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import LoginForm from '../views/LoginForm';

// Mock the API
const mockLogin = vi.fn();

vi.mock('../../../api/client', () => ({
  api: {
    login: (...args: unknown[]) => mockLogin(...args),
  },
}));

// Mock the auth store
const mockState = {
  isLoading: false,
  setAuthenticated: vi.fn(),
  setError: vi.fn(),
  setLoading: vi.fn(),
  clearError: vi.fn(),
  setTotpSetupRequired: vi.fn(),
};

vi.mock('../../../stores/useAuthStore', () => ({
  useAuthStore: () => mockState,
}));

describe('LoginForm', () => {
  const defaultProps = {
    onTotpRequired: vi.fn(),
    onSetupRequired: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isLoading = false;
  });

  it('renders username and password fields', () => {
    render(<LoginForm {...defaultProps} />);

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    render(<LoginForm {...defaultProps} />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('username input has correct autocomplete attribute', () => {
    render(<LoginForm {...defaultProps} />);

    const usernameInput = screen.getByLabelText(/username/i);
    expect(usernameInput).toHaveAttribute('autocomplete', 'username');
  });

  it('password input has correct autocomplete attribute', () => {
    render(<LoginForm {...defaultProps} />);

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  it('password input is of type password', () => {
    render(<LoginForm {...defaultProps} />);

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('username field is required', () => {
    render(<LoginForm {...defaultProps} />);

    const usernameInput = screen.getByLabelText(/username/i);
    expect(usernameInput).toHaveAttribute('aria-required', 'true');
  });

  it('password field is required', () => {
    render(<LoginForm {...defaultProps} />);

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('aria-required', 'true');
  });

  it('shows validation error when username is empty after blur', async () => {
    const user = userEvent.setup();
    render(<LoginForm {...defaultProps} />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    // Focus and then blur username without entering value
    await user.click(usernameInput);
    await user.click(passwordInput);

    await waitFor(() => {
      // Should show validation error
      const error = screen.getByRole('alert');
      expect(error).toBeInTheDocument();
    });
  });

  it('clears error when starting submission', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'test' },
    });

    render(<LoginForm {...defaultProps} />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockState.clearError).toHaveBeenCalled();
  });

  it('sets loading state during submission', async () => {
    const user = userEvent.setup();
    mockLogin.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<LoginForm {...defaultProps} />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockState.setLoading).toHaveBeenCalledWith(true);
  });

  it('calls onTotpRequired when 2FA is needed', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      totpRequired: true,
    });

    const onTotpRequired = vi.fn();

    render(<LoginForm {...defaultProps} onTotpRequired={onTotpRequired} />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(onTotpRequired).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'password123',
      });
    });
  });

  it('calls onSetupRequired when no users exist', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('No users exist'));

    const onSetupRequired = vi.fn();

    render(<LoginForm {...defaultProps} onSetupRequired={onSetupRequired} />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(onSetupRequired).toHaveBeenCalled();
    });
  });

  it('calls onSuccess on successful login', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'test' },
    });

    const onSuccess = vi.fn();

    render(<LoginForm {...defaultProps} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('/', false);
    });
  });

  it('sets error on API failure', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    render(<LoginForm {...defaultProps} />);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockState.setError).toHaveBeenCalledWith('Invalid credentials');
    });
  });

  it('form submission with valid data calls API', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'test' },
    });

    render(<LoginForm {...defaultProps} />);

    await user.type(screen.getByLabelText(/username/i), 'myuser');
    await user.type(screen.getByLabelText(/password/i), 'mypassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('myuser', 'mypassword');
    });
  });
});
