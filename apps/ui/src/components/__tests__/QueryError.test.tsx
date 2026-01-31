import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { QueryError, InlineQueryError } from '../QueryError';

describe('QueryError', () => {
  it('returns null when error is null', () => {
    const { container } = render(<QueryError error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders error message', () => {
    const error = new Error('Something went wrong');
    render(<QueryError error={error} />);

    expect(screen.getByText('Failed to Load')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders custom message instead of error.message', () => {
    const error = new Error('Original error');
    render(<QueryError error={error} message="Custom error message" />);

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
    expect(screen.queryByText('Original error')).not.toBeInTheDocument();
  });

  it('shows retry button when refetch is provided', () => {
    const error = new Error('Test error');
    const refetch = vi.fn();

    render(<QueryError error={error} refetch={refetch} />);

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('does not show retry button when refetch is not provided', () => {
    const error = new Error('Test error');

    render(<QueryError error={error} />);

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('retry button calls refetch', async () => {
    const user = userEvent.setup();
    const error = new Error('Test error');
    const refetch = vi.fn();

    render(<QueryError error={error} refetch={refetch} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows network error message for network failures', () => {
    const error = new Error('Failed to fetch');
    render(<QueryError error={error} />);

    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText(/unable to connect to the server/i)).toBeInTheDocument();
  });

  it('shows network error for "network" keyword', () => {
    const error = new Error('Network error occurred');
    render(<QueryError error={error} />);

    expect(screen.getByText('Connection Error')).toBeInTheDocument();
  });

  it('renders compact mode correctly', () => {
    const error = new Error('Compact error');
    const refetch = vi.fn();

    render(<QueryError error={error} refetch={refetch} compact />);

    expect(screen.getByText('Compact error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // In compact mode, no "Failed to Load" heading
    expect(screen.queryByText('Failed to Load')).not.toBeInTheDocument();
  });

  it('compact retry button calls refetch', async () => {
    const user = userEvent.setup();
    const error = new Error('Compact error');
    const refetch = vi.fn();

    render(<QueryError error={error} refetch={refetch} compact />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('InlineQueryError', () => {
  it('renders as compact QueryError', () => {
    const error = new Error('Inline error');

    render(<InlineQueryError error={error} />);

    expect(screen.getByText('Inline error')).toBeInTheDocument();
    // Should be in compact mode (no "Failed to Load" heading)
    expect(screen.queryByText('Failed to Load')).not.toBeInTheDocument();
  });
});
