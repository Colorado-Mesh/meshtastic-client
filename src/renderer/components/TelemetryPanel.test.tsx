import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { MESHCORE_CAPABILITIES } from '../lib/radio/BaseRadioProvider';
import TelemetryPanel from './TelemetryPanel';

describe('TelemetryPanel', () => {
  it('shows environment section when MeshCore-style env data is present', async () => {
    const { container } = render(
      <TelemetryPanel
        telemetry={[]}
        signalTelemetry={[]}
        environmentTelemetry={[
          {
            timestamp: Date.now(),
            nodeNum: 0x1234abcd,
            temperature: 21.25,
            relativeHumidity: 55,
          },
        ]}
        useFahrenheit={false}
        onToggleFahrenheit={() => {}}
        onRefresh={async () => {}}
        isConnected
        capabilities={MESHCORE_CAPABILITIES}
      />,
    );
    expect(screen.getByRole('heading', { name: /Temperature & Humidity/i })).toBeInTheDocument();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
