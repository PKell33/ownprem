import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '../../test/utils';
import Dashboard from '../Dashboard';
import {
  createMockServer,
  createMockDeployment,
  createMockApp,
  createMockSystemStatus,
  createMockAdminAuthState,
  resetFactoryCounters,
} from '../../test/factories';

// Mock the API hooks
const mockUseServers = vi.fn();
const mockUseDeployments = vi.fn();
const mockUseApps = vi.fn();
const mockUseSystemStatus = vi.fn();
const mockUseStartDeployment = vi.fn();
const mockUseStopDeployment = vi.fn();
const mockUseRestartDeployment = vi.fn();
const mockUseUninstallDeployment = vi.fn();

vi.mock('../../hooks/useApi', () => ({
  useServers: () => mockUseServers(),
  useDeployments: () => mockUseDeployments(),
  useApps: () => mockUseApps(),
  useSystemStatus: () => mockUseSystemStatus(),
  useStartDeployment: () => mockUseStartDeployment(),
  useStopDeployment: () => mockUseStopDeployment(),
  useRestartDeployment: () => mockUseRestartDeployment(),
  useUninstallDeployment: () => mockUseUninstallDeployment(),
}));

// Mock the auth store
const mockAuthState = createMockAdminAuthState();

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => mockAuthState,
}));

// Mock the metrics store
const mockAddMetrics = vi.fn();
vi.mock('../../stores/useMetricsStore', () => ({
  useMetricsStore: (selector: (state: { addMetrics: typeof mockAddMetrics }) => unknown) =>
    selector({ addMetrics: mockAddMetrics }),
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

describe('Dashboard Integration', () => {
  beforeEach(() => {
    resetFactoryCounters();
    vi.clearAllMocks();

    // Default mutation mocks
    mockUseStartDeployment.mockReturnValue({ mutate: vi.fn() });
    mockUseStopDeployment.mockReturnValue({ mutate: vi.fn() });
    mockUseRestartDeployment.mockReturnValue({ mutate: vi.fn() });
    mockUseUninstallDeployment.mockReturnValue({ mutate: vi.fn() });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockUseServers.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: undefined });

    render(<Dashboard />);

    expect(screen.getByText('Loading servers...')).toBeInTheDocument();
    expect(screen.getByText('Loading deployments...')).toBeInTheDocument();
  });

  it('renders server cards after data loads', async () => {
    const servers = [
      createMockServer({ id: 'core', name: 'Core Server', isCore: true }),
      createMockServer({ id: 'worker-1', name: 'Worker Node 1', host: '10.0.0.50' }),
    ];
    const deployments = [
      createMockDeployment({ serverId: 'core', appName: 'nginx', status: 'running' }),
    ];
    const apps = [createMockApp({ name: 'nginx', displayName: 'Nginx' })];
    const status = createMockSystemStatus({ servers: { total: 2, online: 2 } });

    mockUseServers.mockReturnValue({
      data: servers,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: deployments,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: apps });
    mockUseSystemStatus.mockReturnValue({ data: status });

    render(<Dashboard />);

    // Check that server cards are rendered (names may appear multiple times)
    expect(screen.getAllByText('Core Server').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Worker Node 1').length).toBeGreaterThan(0);

    // Check Dashboard heading is present
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders error state when servers API fails', async () => {
    const refetch = vi.fn();
    mockUseServers.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to connect to server'),
      refetch,
    });
    mockUseDeployments.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: undefined });

    render(<Dashboard />);

    // Check that error message is displayed
    expect(screen.getByText('Failed to load servers')).toBeInTheDocument();

    // Check retry button is available
    const retryButton = screen.getByRole('button', { name: /try again/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('renders error state when deployments API fails', async () => {
    mockUseServers.mockReturnValue({
      data: [createMockServer()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Database connection failed'),
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: undefined });

    render(<Dashboard />);

    expect(screen.getByText('Failed to load deployments')).toBeInTheDocument();
  });

  it('displays server cards with correct data from API', async () => {
    const server = createMockServer({
      id: 'production',
      name: 'Production Server',
      host: '10.0.1.100',
      agentStatus: 'online',
    });
    const deployments = [
      createMockDeployment({
        serverId: 'production',
        appName: 'redis',
        status: 'running',
        version: '7.0.0',
      }),
    ];
    const apps = [createMockApp({ name: 'redis', displayName: 'Redis' })];

    mockUseServers.mockReturnValue({
      data: [server],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: deployments,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: apps });
    mockUseSystemStatus.mockReturnValue({
      data: createMockSystemStatus({ servers: { total: 1, online: 1 } }),
    });

    render(<Dashboard />);

    // Server name (appears in server card and in deployments table)
    expect(screen.getAllByText('Production Server').length).toBeGreaterThan(0);
    // Server host
    expect(screen.getAllByText('10.0.1.100').length).toBeGreaterThan(0);
    // App name displayed (Redis appears in multiple places - server card and deployments table)
    expect(screen.getAllByText('Redis').length).toBeGreaterThan(0);
  });

  it('shows empty state when no deployments exist', async () => {
    mockUseServers.mockReturnValue({
      data: [createMockServer()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: createMockSystemStatus() });

    render(<Dashboard />);

    expect(screen.getByText('No apps deployed yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse apps/i })).toBeInTheDocument();
  });

  it('displays deployments in the All Deployments section', async () => {
    const server = createMockServer({ id: 'server-1', name: 'Main Server' });
    const deployments = [
      createMockDeployment({ serverId: 'server-1', appName: 'postgres', status: 'running', version: '15.0' }),
      createMockDeployment({ serverId: 'server-1', appName: 'redis', status: 'stopped', version: '7.0' }),
    ];
    const apps = [
      createMockApp({ name: 'postgres', displayName: 'PostgreSQL' }),
      createMockApp({ name: 'redis', displayName: 'Redis' }),
    ];

    mockUseServers.mockReturnValue({
      data: [server],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: deployments,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: apps });
    mockUseSystemStatus.mockReturnValue({ data: createMockSystemStatus() });

    render(<Dashboard />);

    // App names should be displayed (may appear multiple times in server card and deployments table)
    expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Redis').length).toBeGreaterThan(0);
    // Section header
    expect(screen.getByText('All Deployments')).toBeInTheDocument();
  });

  it('shows Apps with Web UI section for supported apps', async () => {
    const deployments = [
      createMockDeployment({ appName: 'mock-app', status: 'running' }),
      createMockDeployment({ appName: 'grafana', status: 'running' }),
    ];

    mockUseServers.mockReturnValue({
      data: [createMockServer()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: deployments,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: createMockSystemStatus() });

    render(<Dashboard />);

    // Check section header
    expect(screen.getByText('Apps with Web UI')).toBeInTheDocument();

    // Check for links to the apps
    const mockAppLink = screen.getByRole('link', { name: /mock-app/i });
    expect(mockAppLink).toHaveAttribute('href', '/apps/mock-app');

    const grafanaLink = screen.getByRole('link', { name: /grafana/i });
    expect(grafanaLink).toHaveAttribute('href', '/apps/grafana');
  });

  it('displays correct system status in stat cards', async () => {
    const status = createMockSystemStatus({
      status: 'ok',
      servers: { total: 5, online: 4 },
      deployments: { total: 10, running: 8 },
    });

    mockUseServers.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: status });

    render(<Dashboard />);

    // Server stats
    expect(screen.getByText('4')).toBeInTheDocument(); // online
    expect(screen.getByText('of 5')).toBeInTheDocument(); // total

    // Deployment stats
    expect(screen.getByText('8')).toBeInTheDocument(); // running
    expect(screen.getByText('of 10')).toBeInTheDocument(); // total

    // Health status
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('displays up to 3 server cards on dashboard', async () => {
    const servers = [
      createMockServer({ name: 'Server 1' }),
      createMockServer({ name: 'Server 2' }),
      createMockServer({ name: 'Server 3' }),
      createMockServer({ name: 'Server 4' }),
      createMockServer({ name: 'Server 5' }),
    ];

    mockUseServers.mockReturnValue({
      data: servers,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: createMockSystemStatus() });

    render(<Dashboard />);

    // Only first 3 servers should be displayed
    expect(screen.getByText('Server 1')).toBeInTheDocument();
    expect(screen.getByText('Server 2')).toBeInTheDocument();
    expect(screen.getByText('Server 3')).toBeInTheDocument();
    expect(screen.queryByText('Server 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Server 5')).not.toBeInTheDocument();

    // View all link should be present
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/servers');
  });

  it('shows orchestrator label for core server', async () => {
    const coreServer = createMockServer({
      id: 'core',
      name: 'Core Server',
      isCore: true,
    });

    mockUseServers.mockReturnValue({
      data: [coreServer],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDeployments.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApps.mockReturnValue({ data: [] });
    mockUseSystemStatus.mockReturnValue({ data: createMockSystemStatus() });

    render(<Dashboard />);

    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  });
});
