import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    contentClassName?: string;
    bodyClassName?: string;
    hideCloseButton?: boolean;
    disableOverlayClose?: boolean;
}

const modalRootId = 'modal-root';

const ensureModalRoot = (): HTMLElement | null => {
    if (typeof document === 'undefined') {
        return null;
    }
    const existing = document.getElementById(modalRootId);
    if (existing) {
        return existing;
    }
    const node = document.createElement('div');
    node.setAttribute('id', modalRootId);
    document.body.appendChild(node);
    return node;
};

const Modal: React.FC<ModalProps> = ({
    open,
    onClose,
    title,
    children,
    contentClassName,
    bodyClassName,
    hideCloseButton = false,
    disableOverlayClose = false,
}) => {
    const modalRoot = ensureModalRoot();

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open || !modalRoot) {
        return null;
    }

    return ReactDOM.createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
        >
            {disableOverlayClose ? (
                <div
                    className="absolute inset-0 h-full w-full bg-black/60"
                    aria-hidden="true"
                    data-testid="modal-overlay"
                />
            ) : (
                <button
                    type="button"
                    aria-label="Close modal overlay"
                    className="absolute inset-0 h-full w-full bg-black/60"
                    onClick={onClose}
                    data-testid="modal-overlay"
                />
            )}
            <div
                className={`relative z-10 w-full max-w-2xl rounded-lg border border-gray-700 bg-gray-900 shadow-lg ${contentClassName ?? ''}`.trim()}
            >
                {title ? (
                    <header className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
                        <h2 id="modal-title" className="text-lg font-semibold text-gray-100">
                            {title}
                        </h2>
                        {hideCloseButton ? null : (
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded border border-gray-700 px-2 py-1 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200"
                            >
                                Close
                            </button>
                        )}
                    </header>
                ) : null}
                <div className={`px-5 py-6 ${bodyClassName ?? ''}`.trim()}>{children}</div>
            </div>
        </div>,
        modalRoot,
    );
};

export default Modal;
