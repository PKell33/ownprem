import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import InstallModal from '../InstallModal';
import {
  createMockServer,
  createMockApp,
  createMockGroup,
  createMockValidationResponse,
  createMockAdminAuthState,
  resetFactoryCounters,
} from '../../test/factories';

// Mock the API hooks
const mockUseApp = vi.fn();
const mockUseValidateInstall = vi.fn();
const mockUseInstallApp = vi.fn();

vi.mock('../../hooks/useApi', () => ({
  useApp: (name: string) => mockUseApp(name),
  useValidateInstall: (serverId: string, appName: string) => mockUseValidateInstall(serverId, appName),
  useInstallApp: () => mockUseInstallApp(),
}));

// Mock the API client
const mockGetGroups = vi.fn();

vi.mock('../../api/client', () => ({
  api: {
    getGroups: () => mockGetGroups(),
  },
}));

// Mock the auth store
const mockAuthState = createMockAdminAuthState();

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => mockAuthState,
}));

// Mock toast
vi.mock('../../lib/toast', () => ({
  showError: vi.fn(),
}));

// Mock HTMLDialogElement
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) {
    this.open = false;
  });
});

describe('App Installation Flow', () => {
  const mockMutateAsync = vi.fn();
  const defaultServers = [
    createMockServer({ id: 'core', name: 'Core Server', isCore: true, agentStatus: 'online' }),
    createMockServer({ id: 'worker-1', name: 'Worker Node', agentStatus: 'online' }),
  ];

  beforeEach(() => {
    resetFactoryCounters();
    vi.clearAllMocks();

    // Default mock implementations
    mockUseInstallApp.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockGetGroups.mockResolvedValue([createMockGroup({ id: 'default', name: 'Default' })]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders install modal with server selection', async () => {
    const app = createMockApp({ name: 'nginx', displayName: 'Nginx' });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="nginx"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Modal title should show app name
    expect(screen.getByText('Install Nginx')).toBeInTheDocument();

    // Server options should be displayed
    expect(screen.getByText('Core Server')).toBeInTheDocument();
    expect(screen.getByText('Worker Node')).toBeInTheDocument();

    // Cancel and Next buttons
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('validates dependencies for selected server', async () => {
    const app = createMockApp({
      name: 'grafana',
      displayName: 'Grafana',
      requires: [{ service: 'prometheus', locality: 'any-server' }],
    });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({
        valid: true,
        dependencies: [
          { service: 'prometheus', satisfied: true, optional: false, providers: [{ serverId: 'core' }] },
        ],
      }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="grafana"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Dependency should be shown as satisfied
    await waitFor(() => {
      expect(screen.getByText('prometheus')).toBeInTheDocument();
    });
  });

  it('shows loading state while validating dependencies', async () => {
    const app = createMockApp({ name: 'nginx', displayName: 'Nginx' });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(
      <InstallModal
        appName="nginx"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Checking dependencies...')).toBeInTheDocument();
  });

  it('shows error when required dependency is missing', async () => {
    const app = createMockApp({
      name: 'app-with-deps',
      displayName: 'App With Deps',
    });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({
        valid: false,
        dependencies: [
          { service: 'postgres', satisfied: false, optional: false, providers: [] },
        ],
        errors: ['Required service postgres is not available'],
      }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="app-with-deps"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Error should be displayed
    await waitFor(() => {
      expect(screen.getByText('Cannot install:')).toBeInTheDocument();
      expect(screen.getByText('Required service postgres is not available')).toBeInTheDocument();
    });

    // Next button should be disabled
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('proceeds to configuration step when Next is clicked', async () => {
    const user = userEvent.setup();
    const app = createMockApp({
      name: 'configurable-app',
      displayName: 'Configurable App',
      configSchema: [
        { name: 'port', type: 'number', label: 'Port', default: 8080 },
        { name: 'env', type: 'select', label: 'Environment', options: ['dev', 'prod'], default: 'prod' },
      ],
    });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="configurable-app"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Click Next to go to configure step
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Configuration fields should be displayed
    await waitFor(() => {
      expect(screen.getByLabelText(/port/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/environment/i)).toBeInTheDocument();
    });

    // Back and Install buttons
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('shows "No configuration needed" for apps without config schema', async () => {
    const user = userEvent.setup();
    const app = createMockApp({
      name: 'simple-app',
      displayName: 'Simple App',
      configSchema: [],
    });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="simple-app"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText('No configuration needed. Ready to install!')).toBeInTheDocument();
    });
  });

  it('calls install API with correct data when Install is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const app = createMockApp({
      name: 'test-app',
      displayName: 'Test App',
      configSchema: [
        { name: 'setting', type: 'string', label: 'Setting', default: 'default-value' },
      ],
    });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });
    mockMutateAsync.mockResolvedValue({});

    render(
      <InstallModal
        appName="test-app"
        servers={defaultServers}
        onClose={onClose}
      />
    );

    // Go to configure step
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Wait for config step to render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });

    // Click Install
    await user.click(screen.getByRole('button', { name: /install/i }));

    // Verify API was called with correct data
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        serverId: 'core', // First server selected by default
        appName: 'test-app',
        config: { setting: 'default-value' },
        groupId: 'default',
      });
    });

    // Modal should close on success
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows installing state while installation is in progress', async () => {
    const user = userEvent.setup();
    const app = createMockApp({
      name: 'slow-app',
      displayName: 'Slow App',
      configSchema: [],
    });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    // Make install take a while
    mockMutateAsync.mockImplementation(() => new Promise(() => {}));

    render(
      <InstallModal
        appName="slow-app"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Go to configure step and click Install
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /install/i }));

    // Should show installing state
    await waitFor(() => {
      expect(screen.getByText(/installing slow app/i)).toBeInTheDocument();
    });
  });

  it('allows selecting different server', async () => {
    const user = userEvent.setup();
    const app = createMockApp({ name: 'nginx', displayName: 'Nginx' });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="nginx"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Click on Worker Node to select it
    const workerLabel = screen.getByText('Worker Node').closest('label');
    expect(workerLabel).not.toBeNull();
    await user.click(workerLabel!);

    // Validation should be called with the new server
    await waitFor(() => {
      expect(mockUseValidateInstall).toHaveBeenCalledWith('worker-1', 'nginx');
    });
  });

  it('can navigate back from configure step to select step', async () => {
    const user = userEvent.setup();
    const app = createMockApp({
      name: 'nav-test',
      displayName: 'Nav Test',
      configSchema: [{ name: 'opt', type: 'string', label: 'Option' }],
    });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="nav-test"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Go to configure step
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    // Click Back
    await user.click(screen.getByRole('button', { name: /back/i }));

    // Should be back on select step
    await waitFor(() => {
      expect(screen.getByText('Select Server')).toBeInTheDocument();
    });
  });

  it('shows group selection when groups are available', async () => {
    const groups = [
      createMockGroup({ id: 'default', name: 'Default' }),
      createMockGroup({ id: 'team-a', name: 'Team A' }),
    ];
    mockGetGroups.mockResolvedValue(groups);

    const app = createMockApp({ name: 'nginx', displayName: 'Nginx' });
    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="nginx"
        servers={defaultServers}
        onClose={() => {}}
      />
    );

    // Group selection should be visible
    await waitFor(() => {
      expect(screen.getByText('Assign to Group')).toBeInTheDocument();
    });

    // Both groups should be options
    const groupSelect = screen.getByRole('combobox', { name: /assign to group/i });
    expect(groupSelect).toBeInTheDocument();
  });

  it('disables Next button when no servers are online', async () => {
    const offlineServers = [
      createMockServer({ id: 'offline-1', name: 'Offline Server', agentStatus: 'offline' }),
    ];

    const app = createMockApp({ name: 'nginx', displayName: 'Nginx' });
    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(
      <InstallModal
        appName="nginx"
        servers={offlineServers}
        onClose={() => {}}
      />
    );

    // Should show no servers online message
    expect(screen.getByText(/no servers online/i)).toBeInTheDocument();

    // Next button should be disabled
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const app = createMockApp({ name: 'nginx', displayName: 'Nginx' });

    mockUseApp.mockReturnValue({ data: app });
    mockUseValidateInstall.mockReturnValue({
      data: createMockValidationResponse({ valid: true }),
      isLoading: false,
    });

    render(
      <InstallModal
        appName="nginx"
        servers={defaultServers}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
