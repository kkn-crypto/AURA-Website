const DIRECTIONS = ['CENTERED', 'RIGHT', 'DOWN', 'LEFT', 'UP'];
export const API_SCHEMA_VERSION = 1;

export function isContractSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (snapshot.api_schema_version !== API_SCHEMA_VERSION || !['demo', 'live'].includes(snapshot.mode)) return false;
  if (!snapshot.backend || !['starting', 'running', 'error', 'stopped'].includes(snapshot.backend.status)) return false;
  if (!snapshot.cameras || !snapshot.recognition || !snapshot.vision?.face || !snapshot.depth || !snapshot.event_delivery) return false;
  for (const index of ['0', '1']) {
    const camera = snapshot.cameras[index];
    if (!camera || !['starting', 'online', 'offline', 'error', 'simulated'].includes(camera.status)) return false;
    if (!['fresh', 'stale', 'unavailable'].includes(camera.frame_freshness)) return false;
  }
  if (!['starting', 'loading', 'ready', 'disabled', 'unavailable', 'error', 'simulated'].includes(snapshot.recognition.status)) return false;
  if (!['starting', 'loading', 'ready', 'disabled', 'unavailable', 'error', 'simulated'].includes(snapshot.vision.face.status)) return false;
  if (!['UNVALIDATED', 'VALID', 'UNAVAILABLE', 'ERROR'].includes(snapshot.depth.status)) return false;
  if (!['UNVALIDATED', 'VALID', 'UNAVAILABLE'].includes(snapshot.depth.metric_validation_status)) return false;
  if (snapshot.depth.metric_validation_status !== 'VALID' && snapshot.depth.distance_mm != null) return false;
  if (snapshot.depth.metric_validation_status === 'VALID' && !(Number.isFinite(snapshot.depth.distance_mm) && snapshot.depth.distance_mm > 0)) return false;
  if (!['not_configured', 'queued', 'delivered', 'failed'].includes(snapshot.event_delivery.status)) return false;
  return Array.isArray(snapshot.events) && typeof snapshot.updated_at === 'string';
}

export function selectCameraFrame(snapshot, cameraIndex) {
  const index = String(cameraIndex);
  const camera = snapshot?.cameras?.[index];
  const encoded = snapshot?.frames?.[index];
  if (!camera || camera.status !== 'online' || camera.frame_freshness !== 'fresh' || typeof encoded !== 'string') {
    return { status: camera?.frame_freshness === 'stale' ? 'stale' : 'unavailable', frame: null };
  }
  return { status: 'fresh', frame: encoded };
}

function event(text, detail, kind = 'system') {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    text,
    detail,
    kind,
    source: 'SIMULATION',
  };
}

export function createInitialState() {
  return {
    page: 'overview',
    mode: 'disconnected',
    backend: { status: 'disconnected', error: null },
    live: null,
    simulation: {
      started: false, running: false, stopLatched: false, trackingEnabled: false, targetVisible: false,
      angles: null, direction: null, offsetX: null, offsetY: null, ticks: 0,
      cameraActive: { 1: true, 0: true }, events: [],
    },
    preferences: { showOverlay: true, autoFollow: true },
  };
}

export function createDemoSnapshot(simulation) {
  const camera = (index) => ({
    index,
    role: index === 1 ? 'primary_tracking' : 'secondary_display_only',
    status: simulation.cameraActive[index] ? 'simulated' : 'offline',
    resolution: null,
    fps: null,
    error: simulation.cameraActive[index] ? null : 'Simulation preview paused; no physical camera is connected.',
    frame_observed_at_monotonic_s: null,
    frame_age_ms: null,
    frame_freshness: 'unavailable',
  });
  return {
    api_schema_version: API_SCHEMA_VERSION,
    mode: 'demo',
    backend: { status: 'running', mode: 'demo', hardware_output: false, error: null },
    cameras: { '0': camera(0), '1': camera(1) },
    tracking: {
      enabled: simulation.trackingEnabled,
      has_target: simulation.targetVisible,
      status: simulation.trackingEnabled ? (simulation.targetVisible ? 'TRACKING' : 'NO_TARGET') : 'PAUSED',
      identity: simulation.targetVisible ? 'Mock subject 0042' : null,
      recognized: false,
      confidence: simulation.targetVisible ? 0.984 : null,
      direction: simulation.direction,
      direction_x: simulation.direction,
      direction_y: null,
      offset_x: simulation.offsetX,
      offset_y: simulation.offsetY,
      in_dead_zone: null,
      box: null,
      lost_frames: 0,
    },
    recognition: { enabled: false, identity_count: null, status: 'simulated' },
    vision: { face: { status: 'simulated', error: null } },
    controller: {
      mode: 'simulation', motion_enabled: simulation.running,
      stop_latched: simulation.stopLatched, hardware_active: false,
      pan: simulation.angles?.pan ?? null, tilt: simulation.angles?.tilt ?? null,
    },
    depth: {
      status: 'UNAVAILABLE', metric_validation_status: 'UNVALIDATED', distance_mm: null,
      reason: 'No stereo provider is active in demo mode.', source: 'none',
    },
    event_delivery: { status: 'not_configured', last_error: null },
    aws: { status: 'not_configured' },
    events: simulation.events,
    frames: { '0': null, '1': null },
    updated_at: new Date().toISOString(),
  };
}

function logSimulation(state, text, detail, kind = 'system') {
  return { ...state, simulation: { ...state.simulation, events: [event(text, detail, kind), ...state.simulation.events].slice(0, 200) } };
}

function clamp(value, minimum, maximum) {
  return Number(Math.min(maximum, Math.max(minimum, value)).toFixed(1));
}

export function auraReducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, page: action.page };
    case 'BACKEND_STATUS': {
      const backend = { status: action.status, error: action.error || null };
      if (action.status === 'disconnected' || action.status === 'error') return { ...state, mode: state.mode === 'live' ? 'disconnected' : state.mode, backend, live: null };
      return { ...state, backend };
    }
    case 'BACKEND_SNAPSHOT': {
      if (!isContractSnapshot(action.snapshot)) {
        return { ...state, mode: 'disconnected', live: null, backend: { status: 'error', error: 'The backend returned an invalid or unsupported API snapshot.' } };
      }
      const backendStatus = action.connection?.status === 'connected'
        ? (action.snapshot?.backend?.status === 'error' ? 'error' : 'connected')
        : action.connection?.status || 'disconnected';
      return { ...state, mode: 'live', backend: { status: backendStatus, error: action.snapshot?.backend?.error || action.connection?.error || null }, live: action.snapshot, simulation: { ...state.simulation, running: false } };
    }
    case 'BACKEND_DISCONNECTED':
      return { ...state, mode: 'disconnected', live: null, backend: { status: action.error ? 'error' : 'disconnected', error: action.error || null } };
    case 'BACKEND_COMMAND_ERROR':
      return { ...state, backend: { ...state.backend, error: action.error || 'Command failed.' } };
    case 'SIMULATION_START': {
      if (state.backend.status === 'starting' || state.backend.status === 'connected') return state;
      if (state.mode === 'simulation' && state.simulation.running) return state;
      const simulation = {
        ...state.simulation,
        started: true,
        running: true,
        stopLatched: false,
        trackingEnabled: true,
        targetVisible: true,
        angles: state.simulation.angles || { pan: 90, tilt: 90 },
        direction: 'CENTERED', offsetX: 0, offsetY: 0,
      };
      return logSimulation({ ...state, mode: 'simulation', live: null, simulation }, 'Local simulation started', 'ALL VALUES ARE SIMULATED', 'track');
    }
    case 'SIMULATION_STOP':
      if (!state.simulation.running) return state;
      return logSimulation({ ...state, simulation: { ...state.simulation, running: false, stopLatched: true } }, 'Local simulation stopped', 'MOVEMENT HALTED · NO HARDWARE COMMAND SENT');
    case 'SIMULATION_TICK': {
      const current = state.simulation;
      if (state.mode !== 'simulation' || !current.running) return state;
      const ticks = current.ticks + 1;
      const direction = DIRECTIONS[ticks % DIRECTIONS.length];
      const offsetX = current.trackingEnabled && current.targetVisible ? Number(Math.sin(ticks / 3).toFixed(2)) : 0;
      const offsetY = current.trackingEnabled && current.targetVisible ? Number(Math.cos(ticks / 4).toFixed(2)) : 0;
      const angles = { ...current.angles };
      if (state.preferences.autoFollow && current.trackingEnabled && current.targetVisible) {
        angles.pan = clamp(angles.pan + Math.sign(offsetX) * 0.4, 0, 180);
        angles.tilt = clamp(angles.tilt + Math.sign(offsetY) * 0.3, 30, 150);
      }
      return { ...state, simulation: { ...current, ticks, direction: current.trackingEnabled && current.targetVisible ? direction : null, offsetX, offsetY, angles } };
    }
    case 'SIMULATION_NUDGE': {
      if (state.mode !== 'simulation' || state.simulation.stopLatched || !state.simulation.angles || !['pan', 'tilt'].includes(action.axis) || ![-1, 1].includes(action.direction)) return state;
      const [min, max] = action.axis === 'pan' ? [0, 180] : [30, 150];
      const angles = { ...state.simulation.angles, [action.axis]: clamp(state.simulation.angles[action.axis] + action.direction, min, max) };
      return logSimulation({ ...state, simulation: { ...state.simulation, angles } }, `Manual simulated ${action.axis} adjustment`, `${angles[action.axis].toFixed(1)}° · HARDWARE DISABLED`);
    }
    case 'SIMULATION_TOGGLE_TRACKING':
      if (state.mode !== 'simulation') return state;
      return logSimulation({ ...state, simulation: { ...state.simulation, trackingEnabled: !state.simulation.trackingEnabled } }, `Local tracking ${state.simulation.trackingEnabled ? 'paused' : 'enabled'}`, 'SIMULATION ONLY', 'track');
    case 'SIMULATION_TOGGLE_TARGET':
      if (state.mode !== 'simulation') return state;
      return logSimulation({ ...state, simulation: { ...state.simulation, targetVisible: !state.simulation.targetVisible } }, `Mock target ${state.simulation.targetVisible ? 'lost' : 'restored'}`, 'CAMERA 1 · SIMULATED', 'track');
    case 'SIMULATION_TOGGLE_CAMERA': {
      if (state.mode !== 'simulation' || ![0, 1].includes(action.camera)) return state;
      const cameraActive = { ...state.simulation.cameraActive, [action.camera]: !state.simulation.cameraActive[action.camera] };
      return logSimulation({ ...state, simulation: { ...state.simulation, cameraActive } }, `Camera ${action.camera} preview ${cameraActive[action.camera] ? 'resumed' : 'paused'}`, action.camera === 1 ? 'PRIMARY TRACKING · SIMULATED' : 'DISPLAY ONLY · SIMULATED', 'camera');
    }
    case 'SIMULATION_RESET':
      return logSimulation({ ...state, mode: 'simulation', live: null, simulation: { started: true, running: false, stopLatched: false, trackingEnabled: false, targetVisible: false, angles: { pan: 90, tilt: 90 }, direction: null, offsetX: null, offsetY: null, ticks: 0, cameraActive: { 1: true, 0: true }, events: state.simulation.events } }, 'Simulation reset', 'DEFAULT VALUES RESTORED · STILL SIMULATED');
    case 'PREFERENCE_SET':
      if (!['showOverlay', 'autoFollow'].includes(action.key) || typeof action.value !== 'boolean') return state;
      return { ...state, preferences: { ...state.preferences, [action.key]: action.value } };
    default:
      return state;
  }
}

export function createAuraStore(initialState = createInitialState()) {
  let state = initialState;
  let timer;
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch(action) {
      const next = auraReducer(state, action);
      if (next !== state) { state = next; listeners.forEach((listener) => listener()); }
      return state;
    },
    startSimulationClock(intervalMs = 650) {
      if (timer) return;
      timer = setInterval(() => this.dispatch({ type: 'SIMULATION_TICK' }), intervalMs);
    },
    stopSimulationClock() { if (timer) clearInterval(timer); timer = undefined; },
  };
}
