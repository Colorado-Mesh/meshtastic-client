import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { MeshNode, NodeAnomaly } from '../lib/types';
import DiagnosticsPanel from './DiagnosticsPanel';

const diagnosticsStoreState: {
  anomalies: Map<number, NodeAnomaly>;
  packetStats: Map<number, unknown>;
} = {
  anomalies: new Map(),
  packetStats: new Map(),
};

vi.mock('../stores/diagnosticsStore', () => ({
  useDiagnosticsStore: (selector: (s: unknown) => unknown) => {
    const store = {
      anomalies: diagnosticsStoreState.anomalies,
      packetStats: diagnosticsStoreState.packetStats,
      anomalyHalosEnabled: false,
      congestionHalosEnabled: false,
      envMode: 'standard',
      ignoreMqttEnabled: false,
      mqttIgnoredNodes: new Set<number>(),
      setAnomalyHalosEnabled: vi.fn(),
      setCongestionHalosEnabled: vi.fn(),
      setEnvMode: vi.fn(),
      setIgnoreMqttEnabled: vi.fn(),
      setNodeMqttIgnored: vi.fn(),
      runReanalysis: vi.fn(),
    };
    return selector(store);
  },
}));

function minimalNode(nodeId: number): MeshNode {
  return {
    node_id: nodeId,
    long_name: 'Test Node',
    short_name: 'TN',
    hw_model: '',
    snr: 0,
    battery: 0,
    last_heard: Date.now(),
    latitude: null,
    longitude: null,
  };
}

describe('DiagnosticsPanel accessibility', () => {
  it('has no axe violations with empty data', async () => {
    diagnosticsStoreState.anomalies = new Map();
    diagnosticsStoreState.packetStats = new Map();
    const { container } = render(
      <DiagnosticsPanel
        nodes={new Map()}
        myNodeNum={0}
        onTraceRoute={vi.fn().mockResolvedValue(undefined)}
        isConnected={false}
        traceRouteResults={new Map()}
        getFullNodeLabel={vi.fn().mockReturnValue('Unknown')}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('DiagnosticsPanel node click', () => {
  it('calls onNodeClick when anomaly row is clicked', () => {
    const nodeId = 0x1234;
    const node = minimalNode(nodeId);
    const anomaly: NodeAnomaly = {
      nodeId,
      type: 'hop_goblin',
      severity: 'warning',
      description: 'Test anomaly',
      detectedAt: Date.now(),
    };
    diagnosticsStoreState.anomalies = new Map([[nodeId, anomaly]]);
    diagnosticsStoreState.packetStats = new Map();

    const onNodeClick = vi.fn();
    const nodes = new Map<number, MeshNode>([[nodeId, node]]);

    render(
      <DiagnosticsPanel
        nodes={nodes}
        myNodeNum={0}
        onTraceRoute={vi.fn().mockResolvedValue(undefined)}
        isConnected={false}
        traceRouteResults={new Map()}
        getFullNodeLabel={vi.fn().mockReturnValue('Unknown')}
        onNodeClick={onNodeClick}
      />,
    );

    expect(screen.getByText('Test Node')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Test Node'));
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).toHaveBeenCalledWith(node);
  });

  it('does not call onNodeClick when action column is clicked', () => {
    const nodeId = 0x5678;
    const node = minimalNode(nodeId);
    const anomaly: NodeAnomaly = {
      nodeId,
      type: 'hop_goblin',
      severity: 'warning',
      description: 'Test',
      detectedAt: Date.now(),
    };
    diagnosticsStoreState.anomalies = new Map([[nodeId, anomaly]]);
    diagnosticsStoreState.packetStats = new Map();

    const onNodeClick = vi.fn();
    const nodes = new Map<number, MeshNode>([[nodeId, node]]);

    render(
      <DiagnosticsPanel
        nodes={nodes}
        myNodeNum={0}
        onTraceRoute={vi.fn().mockResolvedValue(undefined)}
        isConnected={true}
        traceRouteResults={new Map()}
        getFullNodeLabel={vi.fn().mockReturnValue('Unknown')}
        onNodeClick={onNodeClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ignore mqtt/i }));
    expect(onNodeClick).not.toHaveBeenCalled();
  });
});
