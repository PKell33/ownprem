import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import type { Server, Deployment, AppManifest } from '../api/client';

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry failed queries in tests
        gcTime: 0, // Disable garbage collection time
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial route for MemoryRouter (use instead of BrowserRouter for testing specific routes) */
  initialEntries?: string[];
  /** Use MemoryRouter instead of BrowserRouter */
  useMemoryRouter?: boolean;
  /** Custom QueryClient instance */
  queryClient?: QueryClient;
}

/**
 * Custom render function that wraps components with necessary providers.
 */
function customRender(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    useMemoryRouter = false,
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: WrapperProps) {
    const Router = useMemoryRouter ? MemoryRouter : BrowserRouter;
    const routerProps = useMemoryRouter ? { initialEntries } : {};

    return (
      <QueryClientProvider client={queryClient}>
        <Router {...routerProps}>{children}</Router>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override render with custom render
export { customRender as render };

// Export test query client creator for advanced use cases
export { createTestQueryClient };

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Create a mock server object
 */
export function createMockServer(overrides: Partial<Server> = {}): Server {
  return {
    id: 'server-1',
    name: 'Test Server',
    host: '192.168.1.100',
    isCore: false,
    agentStatus: 'online',
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock deployment object
 */
export function createMockDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 'deployment-1',
    serverId: 'server-1',
    appName: 'mock-app',
    version: '1.0.0',
    status: 'running',
    config: {},
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock app manifest
 */
export function createMockApp(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    name: 'mock-app',
    displayName: 'Mock Application',
    version: '1.0.0',
    description: 'A mock application for testing',
    category: 'web',
    source: { type: 'git', gitUrl: 'https://github.com/example/mock-app' },
    requires: [],
    provides: [],
    configSchema: [],
    ...overrides,
  };
}

/**
 * Create multiple mock servers
 */
export function createMockServers(count: number, overrides: Partial<Server> = {}): Server[] {
  return Array.from({ length: count }, (_, i) =>
    createMockServer({
      id: `server-${i + 1}`,
      name: `Server ${i + 1}`,
      host: `192.168.1.${100 + i}`,
      ...overrides,
    })
  );
}

/**
 * Create multiple mock deployments
 */
export function createMockDeployments(
  count: number,
  overrides: Partial<Deployment> = {}
): Deployment[] {
  return Array.from({ length: count }, (_, i) =>
    createMockDeployment({
      id: `deployment-${i + 1}`,
      appName: `app-${i + 1}`,
      ...overrides,
    })
  );
}
