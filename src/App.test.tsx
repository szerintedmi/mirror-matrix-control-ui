import { act } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('App', () => {
    it('renders the pattern library header by default', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<App />);
        });

        const heading = container.querySelector('h1');
        expect(heading).not.toBeNull();
        expect(heading?.textContent).toMatch(/pattern library/i);

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
