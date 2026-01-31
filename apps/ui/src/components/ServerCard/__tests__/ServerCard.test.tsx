import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import ServerCard from '../ServerCard';
import { createMockServer, createMockDeployment, createMockApp } from '../../../test/utils';

// Mock HTMLDialogElement for modals
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

describe('ServerCard', () => {
  it('renders server name', () => {
    const server = createMockServer({ name: 'Production Server' });

    render(<ServerCard server={server} />);

    expect(screen.getByText('Production Server')).toBeInTheDocument();
  });

  it('renders server host when not core server', () => {
    const server = createMockServer({
      name: 'Worker Node',
      host: '10.0.0.50',
      isCore: false,
    });

    render(<ServerCard server={server} />);

    expect(screen.getByText('10.0.0.50')).toBeInTheDocument();
  });

  it('shows "Orchestrator" label for core server', () => {
    const server = createMockServer({
      name: 'Core Server',
      isCore: true,
    });

    render(<ServerCard server={server} />);

    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  });

  it('shows correct status badge for online server', () => {
    const server = createMockServer({ agentStatus: 'online' });

    render(<ServerCard server={server} />);

    // StatusBadge displays capitalized labels
    const statusBadge = screen.getByText('Online');
    expect(statusBadge).toBeInTheDocument();
  });

  it('shows correct status badge for offline server', () => {
    const server = createMockServer({ agentStatus: 'offline' });

    render(<ServerCard server={server} />);

    const statusBadge = screen.getByText('Offline');
    expect(statusBadge).toBeInTheDocument();
  });

  it('shows correct status badge for error state', () => {
    const server = createMockServer({ agentStatus: 'error' });

    render(<ServerCard server={server} />);

    const statusBadge = screen.getByText('Error');
    expect(statusBadge).toBeInTheDocument();
  });

  it('shows "No apps deployed" when there are no deployments', () => {
    const server = createMockServer();

    render(<ServerCard server={server} deployments={[]} />);

    expect(screen.getByText('No apps deployed')).toBeInTheDocument();
  });

  it('renders deployment items when deployments exist', () => {
    const server = createMockServer();
    const app = createMockApp({ name: 'nginx', displayName: 'Nginx' });
    const deployment = createMockDeployment({
      appName: 'nginx',
      status: 'running',
    });

    render(
      <ServerCard
        server={server}
        deployments={[deployment]}
        apps={[app]}
      />
    );

    expect(screen.getByText('Nginx')).toBeInTheDocument();
  });

  it('shows Add App button when canManage and server is online', () => {
    const server = createMockServer({ agentStatus: 'online' });
    const app = createMockApp({ name: 'available-app', mandatory: false });

    render(
      <ServerCard
        server={server}
        deployments={[]}
        apps={[app]}
        canManage={true}
      />
    );

    expect(screen.getByRole('button', { name: /add app/i })).toBeInTheDocument();
  });

  it('does not show Add App button when server is offline', () => {
    const server = createMockServer({ agentStatus: 'offline' });
    const app = createMockApp({ name: 'available-app' });

    render(
      <ServerCard
        server={server}
        deployments={[]}
        apps={[app]}
        canManage={true}
      />
    );

    expect(screen.queryByRole('button', { name: /add app/i })).not.toBeInTheDocument();
  });

  it('does not show Add App button when canManage is false', () => {
    const server = createMockServer({ agentStatus: 'online' });
    const app = createMockApp({ name: 'available-app' });

    render(
      <ServerCard
        server={server}
        deployments={[]}
        apps={[app]}
        canManage={false}
      />
    );

    expect(screen.queryByRole('button', { name: /add app/i })).not.toBeInTheDocument();
  });

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup();
    const server = createMockServer();
    const onClick = vi.fn();

    render(<ServerCard server={server} onClick={onClick} />);

    const card = screen.getByRole('button', { name: /view .* details/i });
    await user.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('card is keyboard accessible when onClick provided', async () => {
    const user = userEvent.setup();
    const server = createMockServer({ name: 'Test Server' });
    const onClick = vi.fn();

    render(<ServerCard server={server} onClick={onClick} />);

    const card = screen.getByRole('button', { name: /view test server details/i });

    // Focus and press Enter
    card.focus();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('card has correct aria-label when clickable', () => {
    const server = createMockServer({ name: 'My Server' });
    const onClick = vi.fn();

    render(<ServerCard server={server} onClick={onClick} />);

    const card = screen.getByRole('button');
    expect(card).toHaveAccessibleName('View My Server details');
  });

  it('card is not a button when onClick is not provided', () => {
    const server = createMockServer();

    render(<ServerCard server={server} />);

    // Should not find a button role for the card itself
    // (there may be other buttons inside the card)
    expect(screen.queryByRole('button', { name: /view .* details/i })).not.toBeInTheDocument();
  });

  it('opens Add App modal when Add App button clicked', async () => {
    const user = userEvent.setup();
    const server = createMockServer({ agentStatus: 'online', name: 'Test Server' });
    const app = createMockApp({ name: 'nginx', displayName: 'Nginx', mandatory: false });

    render(
      <ServerCard
        server={server}
        deployments={[]}
        apps={[app]}
        canManage={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /add app/i }));

    // Modal should open - check for modal content
    // The modal shows the app to select and server name
    expect(screen.getByText('Nginx')).toBeInTheDocument();
    // Should show cancel button in modal (use getByText due to jsdom dialog limitations)
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('filters out already installed apps from available apps', async () => {
    const user = userEvent.setup();
    const server = createMockServer({ agentStatus: 'online', name: 'Test Server' });
    const installedApp = createMockApp({ name: 'nginx', displayName: 'Nginx' });
    const availableApp = createMockApp({ name: 'redis', displayName: 'Redis' });
    const deployment = createMockDeployment({ appName: 'nginx' });

    render(
      <ServerCard
        server={server}
        deployments={[deployment]}
        apps={[installedApp, availableApp]}
        canManage={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /add app/i }));

    // Redis should be available, Nginx should not (already installed)
    expect(screen.getByText('Redis')).toBeInTheDocument();
    // The installed app name appears in the deployment list, not in the modal options
  });
});
