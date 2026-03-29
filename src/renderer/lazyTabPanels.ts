import { lazy } from 'react';

/**
 * Top-level `import()` starts as soon as this module is evaluated (when App loads).
 * `lazy(() => promise)` reuses that same promise — React does not defer work until first tab
 * mount, unlike `lazy(() => import('./x'))` which only calls `import()` on first render.
 */
const appPanelPromise = import('./components/AppPanel');
const takServerPanelPromise = import('./components/TakServerPanel');
const diagnosticsPanelPromise = import('./components/DiagnosticsPanel');
const mapPanelPromise = import('./components/MapPanel');
const modulePanelPromise = import('./components/ModulePanel');
const radioPanelPromise = import('./components/RadioPanel');
const repeatersPanelPromise = import('./components/RepeatersPanel');
const securityPanelPromise = import('./components/SecurityPanel');
const telemetryPanelPromise = import('./components/TelemetryPanel');

export const AppPanel = lazy(() => appPanelPromise);
export const TakServerPanel = lazy(() => takServerPanelPromise);
export const DiagnosticsPanel = lazy(() => diagnosticsPanelPromise);
export const MapPanel = lazy(() => mapPanelPromise);
export const ModulePanel = lazy(() => modulePanelPromise);
export const RadioPanel = lazy(() => radioPanelPromise);
export const RepeatersPanel = lazy(() => repeatersPanelPromise);
export const SecurityPanel = lazy(() => securityPanelPromise);
export const TelemetryPanel = lazy(() => telemetryPanelPromise);
