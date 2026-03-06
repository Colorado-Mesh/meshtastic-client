import "leaflet/dist/leaflet.css";
import { useEffect, useLayoutEffect, useMemo, Fragment } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import { useShallow } from "zustand/react/shallow";
import L from "leaflet";
import type { MeshNode, NodeAnomaly } from "../lib/types";
import { getNodeStatus, haversineDistanceKm } from "../lib/nodeStatus";
import { useDiagnosticsStore } from "../stores/diagnosticsStore";
import RefreshButton from "./RefreshButton";
import NodeInfoBody from "./NodeInfoBody";
import type { LocationFilter } from "../App";

// ─── Map styles (anomaly halos + dark popup) ──────────────────────────────────

const MAP_STYLE_ID = "map-styles";
function ensureMapStyles() {
  if (document.getElementById(MAP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MAP_STYLE_ID;
  style.textContent = `
    @keyframes anomaly-pulse {
      0%, 100% { opacity: 0.75; }
      50%       { opacity: 0.15; }
    }
    .anomaly-halo-warning {
      animation: anomaly-pulse 2s ease-in-out infinite;
      pointer-events: none !important;
    }
    .anomaly-halo-error {
      animation: anomaly-pulse 1.4s ease-in-out infinite;
      pointer-events: none !important;
    }
    .leaflet-popup-content-wrapper {
      background: #0d0d0d;
      border: 1px solid #374151;
      color: #e5e7eb;
      border-radius: 0.75rem;
      padding: 0;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .leaflet-popup-tip {
      background: #0d0d0d;
    }
    .leaflet-popup-content {
      margin: 0;
      min-width: 220px;
      max-width: 320px;
    }
    .leaflet-popup-close-button {
      color: #9ca3af !important;
    }
    .leaflet-popup-close-button:hover {
      color: #e5e7eb !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── Marker icon helpers ──────────────────────────────────────────────────────

function getCUColor(cu: number): string {
  if (cu < 15) return "#22c55e";
  if (cu < 31) return "#eab308";
  if (cu < 51) return "#f97316";
  return "#ef4444";
}

function createMarkerIcon(
  color: string,
  isSelf: boolean,
  cu: number = 0,
  markerOpacity: number = 1,
  isMqttOnly: boolean = false,
): L.Icon {
  const haloPx = cu <= 0 ? 0 : Math.round((cu / 100) * 14);
  const haloColor = getCUColor(cu);
  const halo = (c: number) =>
    haloPx > 0
      ? `<circle cx="${c}" cy="${c}" r="${c - 0.5}" fill="${haloColor}" opacity="0.4"/>`
      : "";
  const mqttBadge = (c: number) =>
    isMqttOnly
      ? `<circle cx="${c + 7}" cy="${c - 7}" r="4" fill="#3b82f6" stroke="#fff" stroke-width="1.5"/>`
      : "";

  if (isSelf) {
    const total = 32 + 2 * haloPx;
    const c = total / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" opacity="${markerOpacity}">${halo(c)}<g transform="translate(${haloPx},${haloPx}) scale(${32 / 24})"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="${color}" stroke="#000" stroke-width="0.5"/></g>${mqttBadge(c)}</svg>`;
    return L.icon({
      iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      iconSize: [total, total],
      iconAnchor: [c, c],
      popupAnchor: [0, -c],
    });
  }

  const total = 25 + 2 * haloPx;
  const c = total / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" opacity="${markerOpacity}">${halo(c)}<circle cx="${c}" cy="${c}" r="10.4" fill="${color}" stroke="#000" stroke-width="1" opacity="0.9"/><circle cx="${c}" cy="${c}" r="4.2" fill="#fff" opacity="0.8"/>${mqttBadge(c)}</svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    iconSize: [total, total],
    iconAnchor: [c, c],
    popupAnchor: [0, -c],
  });
}

function getMarkerIcon(
  status: "online" | "stale" | "offline",
  isSelf: boolean,
  cu: number,
  isMqttOnly: boolean = false,
): L.Icon {
  const color =
    status === "online" ? "#9ae6b4" : status === "stale" ? "#c4a864" : "#6b7280";
  const opacity = status === "online" ? 1 : status === "stale" ? 0.65 : 0.45;
  return createMarkerIcon(color, isSelf, cu, opacity, isMqttOnly);
}

// ─── DiagnosticPanes ──────────────────────────────────────────────────────────
// Creates a dedicated Leaflet pane for anomaly halos. Sits above overlayPane
// (400) but below markerPane (600). The whole pane is pointer-events:none so
// animated circles never intercept clicks destined for markers.

function DiagnosticPanes() {
  const map = useMap();
  // useLayoutEffect runs synchronously after DOM commit but BEFORE any useEffect
  // fires — including the useEffect inside react-leaflet that calls layer.addTo(map).
  // This guarantees "diagnosticPane" exists when Circle layers resolve their pane.
  useLayoutEffect(() => {
    if (!map.getPane("diagnosticPane")) {
      const pane = map.createPane("diagnosticPane");
      // 650 = above markerPane (600) so halos are never clipped by it,
      // but still below tooltipPane (700) / popupPane (800).
      pane.style.zIndex = "650";
      pane.style.pointerEvents = "none";
    }
  }, [map]);
  return null;
}

// ─── MapMarker ────────────────────────────────────────────────────────────────

interface MapMarkerProps {
  node: MeshNode;
  anomaly: NodeAnomaly | null;
  isSelf: boolean;
  anomalyHalosEnabled: boolean;
  congestionHalosEnabled: boolean;
  homeNode?: MeshNode | null;
}

function MapMarker({
  node,
  anomaly,
  isSelf,
  anomalyHalosEnabled,
  congestionHalosEnabled,
  homeNode,
}: MapMarkerProps) {
  const status = getNodeStatus(node.last_heard);
  const cu = congestionHalosEnabled ? (node.channel_utilization ?? 0) : 0;

  const icon = useMemo(
    () => getMarkerIcon(status, isSelf, cu, node.heard_via_mqtt_only),
    [status, isSelf, cu, node.heard_via_mqtt_only],
  );

  const shouldShowHalo = useMemo(
    () => anomalyHalosEnabled && anomaly !== null,
    [anomalyHalosEnabled, anomaly],
  );

  const isError = anomaly?.severity === "error";

  return (
    <Fragment>
      {shouldShowHalo && (
        <Circle
          center={[node.latitude, node.longitude]}
          radius={500}
          pane="diagnosticPane"
          interactive={false}
          pathOptions={{
            color: isError ? "#ef4444" : "#FFBF00",
            fillColor: isError ? "#ef4444" : "#FFBF00",
            fillOpacity: 0.18,
            weight: 2,
            opacity: 0.75,
            className: isError ? "anomaly-halo-error" : "anomaly-halo-warning",
          }}
        />
      )}
      {congestionHalosEnabled && node.channel_utilization != null && (
        <Circle
          center={[node.latitude, node.longitude]}
          radius={300}
          interactive={false}
          pathOptions={{
            color: getCUColor(node.channel_utilization),
            fillColor: getCUColor(node.channel_utilization),
            fillOpacity: 0.25,
            weight: 1,
            opacity: 0.6,
          }}
        />
      )}
      <Marker
        position={[node.latitude, node.longitude]}
        icon={icon}
        zIndexOffset={isSelf ? 1000 : 0}
      >
        <Popup>
          <div className="px-4 py-3">
            <div className="font-semibold text-gray-100 mb-2 flex items-center gap-1.5">
              {isSelf && <span title="Your node">★</span>}
              {node.long_name || `!${node.node_id.toString(16)}`}
              <span className="text-xs text-muted font-mono ml-1">
                !{node.node_id.toString(16)}
              </span>
            </div>
            <NodeInfoBody node={node} homeNode={homeNode} />
          </div>
        </Popup>
      </Marker>
    </Fragment>
  );
}

// ─── MapFitter ────────────────────────────────────────────────────────────────

function MapFitter({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.flyTo(positions[0], map.getZoom());
    } else {
      const bounds = L.latLngBounds(
        positions.map(([lat, lng]) => L.latLng(lat, lng)),
      );
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [positions.length, map]);
  return null;
}

// ─── MapPanel ─────────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [40.1672, -105.1019];
const DEFAULT_ZOOM = 12;

interface Props {
  nodes: Map<number, MeshNode>;
  myNodeNum: number;
  onRefresh: () => Promise<void>;
  isConnected: boolean;
  locationFilter: LocationFilter;
}

export default function MapPanel({
  nodes,
  myNodeNum,
  onRefresh,
  isConnected,
  locationFilter,
}: Props) {
  const homeNode = nodes.get(myNodeNum) ?? null;

  const congestionHalosEnabled = useDiagnosticsStore(
    (s) => s.congestionHalosEnabled,
  );
  const anomalyHalosEnabled = useDiagnosticsStore((s) => s.anomalyHalosEnabled);

  // useShallow ensures the component only re-renders when the Map reference
  // itself changes (which the store guarantees on every anomaly write).
  const anomalies = useDiagnosticsStore(
    useShallow((s) => s.anomalies),
  );

  // ── Debug: fires whenever the store pushes a new anomalies Map reference ──
  useEffect(() => {
    console.log("Map detected anomaly change:", anomalies);
  }, [anomalies]);

  useEffect(() => {
    ensureMapStyles();
  }, []);

  const nodesWithPosition = useMemo(() => {
    const homeNode = myNodeNum ? nodes.get(myNodeNum) : undefined;
    const homeHasLocation =
      homeNode &&
      homeNode.latitude != null &&
      homeNode.latitude !== 0 &&
      homeNode.longitude != null &&
      homeNode.longitude !== 0;
    const maxKm =
      locationFilter.unit === "miles"
        ? locationFilter.maxDistance * 1.60934
        : locationFilter.maxDistance;

    return Array.from(nodes.values()).filter((n) => {
      if (!n.latitude || !n.longitude) return false;
      if (locationFilter.hideMqttOnly && n.heard_via_mqtt_only) return false;
      if (locationFilter.enabled && homeHasLocation) {
        const d = haversineDistanceKm(
          homeNode!.latitude,
          homeNode!.longitude,
          n.latitude,
          n.longitude,
        );
        if (d > maxKm) return false;
      }
      return true;
    });
  }, [nodes, myNodeNum, locationFilter]);

  // Combine node list with anomaly state so MapMarker only re-renders when a
  // specific node's health status actually changes (not on every Zustand tick).
  const nodesWithStatus = useMemo(
    () =>
      nodesWithPosition.map((node) => ({
        node,
        anomaly: anomalies.get(node.node_id) ?? null,
      })),
    [nodesWithPosition, anomalies],
  );

  const positions = useMemo<[number, number][]>(
    () => nodesWithPosition.map((n) => [n.latitude, n.longitude]),
    [nodesWithPosition],
  );

  const center: [number, number] =
    nodesWithPosition.length > 0
      ? [nodesWithPosition[0].latitude, nodesWithPosition[0].longitude]
      : DEFAULT_CENTER;

  const statusCounts = useMemo(() => {
    const counts = { online: 0, stale: 0, offline: 0 };
    for (const n of nodesWithPosition) {
      counts[getNodeStatus(n.last_heard)]++;
    }
    return counts;
  }, [nodesWithPosition]);

  return (
    <div className="h-full min-h-[500px] rounded-lg overflow-hidden border border-gray-700 relative">
      {/* Controls overlay — top right */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        <div className="bg-deep-black/80 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-3 text-xs border border-gray-700">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-brand-green inline-block" />
            {statusCounts.online}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block opacity-60" />
            {statusCounts.stale}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
            {statusCounts.offline}
          </span>
        </div>
        <div className="bg-deep-black/70 rounded-full">
          <RefreshButton onRefresh={onRefresh} disabled={!isConnected} />
        </div>
      </div>

      <MapContainer center={center} zoom={DEFAULT_ZOOM} className="h-full w-full">
        <DiagnosticPanes />
        <MapFitter positions={positions} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {nodesWithStatus.map(({ node, anomaly }) => (
          <MapMarker
            key={node.node_id}
            node={node}
            anomaly={anomaly}
            isSelf={node.node_id === myNodeNum}
            anomalyHalosEnabled={anomalyHalosEnabled}
            congestionHalosEnabled={congestionHalosEnabled}
            homeNode={homeNode}
          />
        ))}
      </MapContainer>

      {nodesWithPosition.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-deep-black/80 px-4 py-2 rounded-lg text-muted text-sm">
            No nodes with GPS positions yet
          </div>
        </div>
      )}
    </div>
  );
}
