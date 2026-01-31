import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import Admin from '../index';
import {
  createMockUser,
  createMockUsers,
  createMockGroup,
  createMockGroups,
  createMockGroupWithMembers,
  createMockAdminAuthState,
  resetFactoryCounters,
} from '../../../test/factories';

// Mock the API
const mockGetUsers = vi.fn();
const mockGetGroups = vi.fn();
const mockGetGroup = vi.fn();
const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockResetUserTotp = vi.fn();
const mockCreateGroup = vi.fn();
const mockUpdateGroup = vi.fn();
const mockDeleteGroup = vi.fn();
const mockGetAuditLogs = vi.fn();
const mockGetAuditLogActions = vi.fn();

vi.mock('../../../api/client', () => ({
  api: {
    getUsers: () => mockGetUsers(),
    getGroups: () => mockGetGroups(),
    getGroup: (id: string) => mockGetGroup(id),
    createUser: (...args: unknown[]) => mockCreateUser(...args),
    deleteUser: (id: string) => mockDeleteUser(id),
    resetUserTotp: (id: string) => mockResetUserTotp(id),
    createGroup: (...args: unknown[]) => mockCreateGroup(...args),
    updateGroup: (...args: unknown[]) => mockUpdateGroup(...args),
    deleteGroup: (id: string) => mockDeleteGroup(id),
    getAuditLogs: (...args: unknown[]) => mockGetAuditLogs(...args),
    getAuditLogActions: () => mockGetAuditLogActions(),
  },
}));

// Mock the auth store - default to admin user
const mockAdminUser = {
  userId: 'admin-1',
  username: 'admin',
  isSystemAdmin: true,
  groups: [],
};

let mockAuthState = createMockAdminAuthState();

vi.mock('../../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    ...mockAuthState,
    user: mockAdminUser,
  }),
}));

// Mock react-router-dom Navigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to}>Redirecting...</div>,
  };
});

// Mock HTMLDialogElement
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) {
    this.open = false;
  });
});

describe('Admin Page Integration', () => {
  beforeEach(() => {
    resetFactoryCounters();
    vi.clearAllMocks();

    // Default successful API responses
    mockGetUsers.mockResolvedValue([]);
    mockGetGroups.mockResolvedValue([]);
    mockGetAuditLogs.mockResolvedValue({ logs: [], total: 0 });
    mockGetAuditLogActions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tab Navigation', () => {
    it('renders with Users tab active by default', async () => {
      mockGetUsers.mockResolvedValue(createMockUsers(2));

      render(<Admin />);

      // Check Users tab is active
      const usersTab = screen.getByRole('button', { name: /users/i });
      expect(usersTab).toHaveClass('border-blue-500');

      // Check Users content loads
      await waitFor(() => {
        expect(mockGetUsers).toHaveBeenCalled();
      });
    });

    it('switches to Groups tab when clicked', async () => {
      const user = userEvent.setup();
      mockGetUsers.mockResolvedValue([]);
      mockGetGroups.mockResolvedValue(createMockGroups(2));

      render(<Admin />);

      // Click Groups tab
      const groupsTab = screen.getByRole('button', { name: /groups/i });
      await user.click(groupsTab);

      // Check Groups tab is now active
      expect(groupsTab).toHaveClass('border-blue-500');

      // Check Groups content loads
      await waitFor(() => {
        expect(mockGetGroups).toHaveBeenCalled();
      });

      expect(screen.getByText('All Groups')).toBeInTheDocument();
    });

    it('switches to Audit Log tab when clicked', async () => {
      const user = userEvent.setup();
      mockGetUsers.mockResolvedValue([]);
      mockGetAuditLogs.mockResolvedValue({ logs: [], total: 0 });
      mockGetAuditLogActions.mockResolvedValue(['login', 'logout']);

      render(<Admin />);

      // Click Audit Log tab
      const auditTab = screen.getByRole('button', { name: /audit log/i });
      await user.click(auditTab);

      // Check Audit Log tab is now active
      expect(auditTab).toHaveClass('border-blue-500');

      // Check Audit Log content loads
      await waitFor(() => {
        expect(mockGetAuditLogs).toHaveBeenCalled();
      });
    });

    it('shows correct tab content for each tab', async () => {
      const user = userEvent.setup();
      const users = createMockUsers(2);
      const groups = createMockGroups(2);

      mockGetUsers.mockResolvedValue(users);
      mockGetGroups.mockResolvedValue(groups);

      render(<Admin />);

      // Initially on Users tab - check for user management content
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
      });

      // Switch to Groups tab
      await user.click(screen.getByRole('button', { name: /groups/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new group/i })).toBeInTheDocument();
      });

      // Switch back to Users tab
      await user.click(screen.getByRole('button', { name: /users/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
      });
    });
  });

  describe('User Management Section', () => {
    it('loads and displays users', async () => {
      const users = [
        createMockUser({ id: 'user-1', username: 'alice', is_system_admin: false }),
        createMockUser({ id: 'user-2', username: 'bob', is_system_admin: true }),
      ];
      mockGetUsers.mockResolvedValue(users);

      render(<Admin />);

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
        expect(screen.getByText('bob')).toBeInTheDocument();
      });

      // Admin user should show System Admin badge
      expect(screen.getByText('System Admin')).toBeInTheDocument();
    });

    it('shows loading state while fetching users', async () => {
      mockGetUsers.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<Admin />);

      // Should show loading spinner
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows error state when user fetch fails', async () => {
      mockGetUsers.mockRejectedValue(new Error('Failed to load users'));

      render(<Admin />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument();
      });
    });

    it('can open create user modal', async () => {
      const user = userEvent.setup();
      mockGetUsers.mockResolvedValue([]);

      render(<Admin />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add user/i }));

      // Modal should open with form fields
      await waitFor(() => {
        expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });
    });

    it('shows "You" badge for current user', async () => {
      const users = [
        createMockUser({ id: 'admin-1', username: 'admin', is_system_admin: true }),
        createMockUser({ id: 'user-2', username: 'other', is_system_admin: false }),
      ];
      mockGetUsers.mockResolvedValue(users);

      render(<Admin />);

      await waitFor(() => {
        // Current user (admin-1) should have "You" badge
        expect(screen.getByText('You')).toBeInTheDocument();
      });
    });

    it('shows 2FA status for users', async () => {
      const users = [
        createMockUser({ username: 'with2fa', totp_enabled: true }),
        createMockUser({ username: 'without2fa', totp_enabled: false }),
      ];
      mockGetUsers.mockResolvedValue(users);

      render(<Admin />);

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
        expect(screen.getByText('Disabled')).toBeInTheDocument();
      });
    });
  });

  describe('Group Management Section', () => {
    it('loads and displays groups', async () => {
      const user = userEvent.setup();
      const groups = [
        createMockGroup({ id: 'default', name: 'Default Group', description: 'Default group' }),
        createMockGroup({ id: 'devs', name: 'Developers', description: 'Dev team' }),
      ];
      mockGetUsers.mockResolvedValue([]);
      mockGetGroups.mockResolvedValue(groups);

      render(<Admin />);

      // Switch to Groups tab
      await user.click(screen.getByRole('button', { name: /groups/i }));

      await waitFor(() => {
        expect(screen.getByText('Default Group')).toBeInTheDocument();
        expect(screen.getByText('Developers')).toBeInTheDocument();
      });
    });

    it('can open create group modal', async () => {
      const user = userEvent.setup();
      mockGetUsers.mockResolvedValue([]);
      mockGetGroups.mockResolvedValue([]);

      render(<Admin />);

      // Switch to Groups tab
      await user.click(screen.getByRole('button', { name: /groups/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new group/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /new group/i }));

      // Modal should open with form fields
      await waitFor(() => {
        expect(screen.getByLabelText(/group name/i)).toBeInTheDocument();
      });
    });

    it('shows group details when a group is selected', async () => {
      const user = userEvent.setup();
      const groups = [
        createMockGroup({ id: 'team-a', name: 'Team A', totp_required: true }),
      ];
      const groupWithMembers = createMockGroupWithMembers({
        id: 'team-a',
        name: 'Team A',
        totp_required: true,
        members: [
          { userId: 'user-1', username: 'alice', role: 'admin', isSystemAdmin: false },
        ],
      });

      mockGetUsers.mockResolvedValue([]);
      mockGetGroups.mockResolvedValue(groups);
      mockGetGroup.mockResolvedValue(groupWithMembers);

      render(<Admin />);

      // Switch to Groups tab
      await user.click(screen.getByRole('button', { name: /groups/i }));

      // Select a group
      await waitFor(() => {
        expect(screen.getByText('Team A')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('option', { name: /team a/i }));

      // Group details should load
      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalledWith('team-a');
      });

      // Should show member
      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });
    });

    it('shows 2FA required badge for groups', async () => {
      const user = userEvent.setup();
      const groups = [
        createMockGroup({ id: 'secure', name: 'Secure Team', totp_required: true }),
      ];
      mockGetUsers.mockResolvedValue([]);
      mockGetGroups.mockResolvedValue(groups);

      render(<Admin />);

      // Switch to Groups tab
      await user.click(screen.getByRole('button', { name: /groups/i }));

      await waitFor(() => {
        expect(screen.getByText('2FA Required')).toBeInTheDocument();
      });
    });

    it('shows "Select a group" prompt when no group selected', async () => {
      const user = userEvent.setup();
      mockGetUsers.mockResolvedValue([]);
      mockGetGroups.mockResolvedValue([createMockGroup()]);

      render(<Admin />);

      // Switch to Groups tab
      await user.click(screen.getByRole('button', { name: /groups/i }));

      await waitFor(() => {
        expect(screen.getByText('Select a group to view details and manage members')).toBeInTheDocument();
      });
    });
  });

  describe('Access Control', () => {
    it('shows admin content only for system admins', async () => {
      // The mock is already configured with an admin user
      // Verify that admin content is accessible
      mockGetUsers.mockResolvedValue([]);

      render(<Admin />);

      // Admin should see the administration heading
      expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument();

      // And the tabs
      expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /groups/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /audit log/i })).toBeInTheDocument();
    });
  });
});
