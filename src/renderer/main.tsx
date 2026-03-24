/// <reference types="vite/client" />
// Load before App so tab-panel chunks start fetching before the rest of App’s import graph runs.
import './lazyTabPanels';
import './styles.css';

import { createRoot } from 'react-dom/client';

import App from './App';

if (import.meta.env.DEV) {
  void import('react').then((React) =>
    import('react-dom').then((ReactDOM) =>
      import('@axe-core/react').then((axe) => axe.default(React.default, ReactDOM.default, 1000)),
    ),
  );
}

createRoot(document.getElementById('root')!).render(<App />);
