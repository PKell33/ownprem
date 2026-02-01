import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { Login } from '../index';

// Mock the API
const mockLogin = vi.fn();
const mockSetup = vi.fn();
const mockCheckSetup = vi.fn();

vi.mock('../../../api/client', () => ({
  api: {
    login: (...args: unknown[]) => mockLogin(...args),
    setup: (...args: unknown[]) => mockSetup(...args),
    checkSetup: () => mockCheckSetup(),
  },
}));

// Mock the auth store
const mockSetAuthenticated = vi.fn();
const mockSetError = vi.fn();
const mockSetLoading = vi.fn();
const mockClearError = vi.fn();

vi.mock('../../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    error: null,
    isLoading: false,
    setAuthenticated: mockSetAuthenticated,
    setError: mockSetError,
    setLoading: mockSetLoading,
    clearError: mockClearError,
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockCheckSetup.mockResolvedValue({ needsSetup: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // Helper to show the login card from splash mode
  async function showLoginCard(user: ReturnType<typeof userEvent.setup>) {
    // Wait for checkSetup to complete and timers to advance
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); // Let checkSetup resolve
    });

    // Wait for splash login button to appear (1500ms delay)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // Click the splash login button to show the card (exact match to avoid "Back to login")
    const splashLoginButton = screen.getByRole('button', { name: 'Login' });
    await user.click(splashLoginButton);
  }

  it('renders login form after clicking splash login button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Login />);

    await showLoginCard(user);

    expect(screen.getByText('Orchestrate Everything')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields on blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Login />);

    await showLoginCard(user);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText('Password');

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
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'testuser' },
    });

    render(<Login />);

    await showLoginCard(user);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password123');
    });
  });

  it('navigates to home on successful login', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockLogin.mockResolvedValueOnce({
      user: { id: '1', username: 'testuser' },
    });

    render(<Login />);

    await showLoginCard(user);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSetAuthenticated).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('transitions to setup view when no users exist', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockLogin.mockRejectedValueOnce(new Error('No users exist'));

    render(<Login />);

    await showLoginCard(user);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Create Admin Account')).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });
  });

  it('shows API error messages', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    render(<Login />);

    await showLoginCard(user);

    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText('Password'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith('Invalid credentials');
    });
  });

  it('setup form shows back button to return to login', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockLogin.mockRejectedValueOnce(new Error('No users exist'));

    render(<Login />);

    await showLoginCard(user);

    // Trigger setup view
    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Create Admin Account')).toBeInTheDocument();
    });

    // Click back button
    await user.click(screen.getByRole('button', { name: /back to login/i }));

    // Should be back on login view
    expect(screen.getByText('Orchestrate Everything')).toBeInTheDocument();
  });

  it('automatically shows setup form when checkSetup returns needsSetup: true', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockCheckSetup.mockResolvedValue({ needsSetup: true });

    render(<Login />);

    await showLoginCard(user);

    // Should automatically be in setup view
    await waitFor(() => {
      expect(screen.getByText('Create Admin Account')).toBeInTheDocument();
    });
  });
});
