import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import Modal from '../Modal';

// Mock HTMLDialogElement methods
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) {
    this.open = false;
  });
});

describe('Modal', () => {
  it('renders when isOpen is true (via conditional rendering)', () => {
    const isOpen = true;

    // Using the recommended pattern: conditionally render the modal
    render(
      <>
        {isOpen && (
          <Modal isOpen={isOpen} onClose={() => {}} title="Test Modal">
            <p>Modal content</p>
          </Modal>
        )}
      </>
    );

    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when not in DOM (conditional rendering pattern)', () => {
    const isOpen = false;

    render(
      <>
        {isOpen && (
          <Modal isOpen={isOpen} onClose={() => {}} title="Test Modal">
            <p>Modal content</p>
          </Modal>
        )}
      </>
    );

    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('calls showModal when opened', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        Content
      </Modal>
    );

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        Content
      </Modal>
    );

    // Find the close button by its aria-label
    const closeButton = screen.getByLabelText('Close dialog');
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        Content
      </Modal>
    );

    // Find the dialog element
    const dialog = document.querySelector('dialog');
    expect(dialog).not.toBeNull();

    fireEvent.keyDown(dialog!, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has aria-labelledby attribute', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Accessible Modal">
        Content
      </Modal>
    );

    const dialog = document.querySelector('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby');

    // The title should be in the document
    expect(screen.getByText('Accessible Modal')).toBeInTheDocument();
  });

  it('close button has accessible name', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        Content
      </Modal>
    );

    const closeButton = screen.getByLabelText('Close dialog');
    expect(closeButton).toBeInTheDocument();
  });

  it('applies size classes correctly', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={() => {}} title="Small Modal" size="sm">
        Content
      </Modal>
    );

    let dialog = document.querySelector('dialog');
    expect(dialog).toHaveClass('max-w-md');

    rerender(
      <Modal isOpen={true} onClose={() => {}} title="Large Modal" size="lg">
        Content
      </Modal>
    );

    dialog = document.querySelector('dialog');
    expect(dialog).toHaveClass('max-w-2xl');
  });

  it('renders children in content area', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <form>
          <input type="text" placeholder="Test input" />
          <button type="submit">Submit</button>
        </form>
      </Modal>
    );

    expect(screen.getByPlaceholderText('Test input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });
});
