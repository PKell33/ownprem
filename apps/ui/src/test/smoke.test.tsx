import { describe, it, expect } from 'vitest';
import { render, screen } from './utils';
import { LoadingSpinner } from '../components/LoadingSpinner';

describe('Test setup', () => {
  it('renders a component', () => {
    render(<LoadingSpinner message="Loading..." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders without message', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('applies size variants', () => {
    const { rerender, container } = render(<LoadingSpinner size="sm" />);
    // Small spinner should render
    expect(container.querySelector('svg')).toBeInTheDocument();

    rerender(<LoadingSpinner size="lg" message="Large spinner" />);
    expect(screen.getByText('Large spinner')).toBeInTheDocument();
  });
});
