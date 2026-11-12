import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createAuraStore, createDemoSnapshot, selectCameraFrame } from '../state/auraStore.js';

const store = createAuraStore();
const pages = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'cameras', label: 'Camera feeds', icon: 'camera', badge: '2' },
  { id: 'tracking', label: 'Tracking', icon: 'target' },
  { id: 'pan-tilt', label: 'Pan / Tilt', icon: 'sliders' },
  { id: 'events', label: 'Event history', icon: 'history' },
];
const titles = { overview: 'Overview', cameras: 'Camera feeds', tracking: 'Tracking', 'pan-tilt': 'Pan / Tilt', events: 'Event history', preferences: 'Preferences' };
const dispatch = (type, data = {}) => store.dispatch({ type, ...data });

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const shapes = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    camera: <><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    sliders: <><path d="M4 7h10m4 0h2M4 17h2m4 0h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-.8 -1) scale(.96)"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, crosshair: <><circle cx="12" cy="12" r="7"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>, bolt: <path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z"/>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    play: <path d="m8 5 12 7-12 7V5Z" fill="currentColor" stroke="none"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 12-2L20 12M4 12l2.4 5a7 7 0 0 0 12-2"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  };
  return <svg {...common}>{shapes[name]}</svg>;
}

function Sidebar({ current }) {
  return <aside className="sidebar">
    <button className="brand brand-button" onClick={() => dispatch('NAVIGATE', { page: 'overview' })} aria-label="Go to overview"><div className="brand-mark"><Icon name="crosshair" size={21}/></div><div><div className="brand-name">AURA</div><div className="brand-caption">VISION SYSTEMS</div></div></button>
    <div className="nav-label">WORKSPACE</div>
    <nav className="nav-list" aria-label="Main navigation">{pages.map((page) => <button key={page.id} className={`nav-item ${current === page.id ? 'active' : ''}`} onClick={() => dispatch('NAVIGATE', { page: page.id })} aria-current={current === page.id ? 'page' : undefined}><Icon name={page.icon}/><span>{page.label}</span>{page.badge && <small>{page.badge}</small>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="nav-label">SYSTEM</div><button className={`nav-item ${current === 'preferences' ? 'active' : ''}`} onClick={() => dispatch('NAVIGATE', { page: 'preferences' })} aria-current={current === 'preferences' ? 'page' : undefined}><Icon name="settings"/><span>Preferences</span></button><div className="profile-card"><div className="avatar">A</div><div className="profile-copy"><strong>Local operator</strong><span>Local session</span></div><span className="profile-dot"/></div></div>
  </aside>;
}

function ServiceBadge({ label, value, tone, title }) {
  return <div className="service" title={title}><span className={`service-dot ${tone}`}/><span className="service-label">{label}</span><span className={`service-state ${tone}`}>{value}</span></div>;
}

function getCameraData(state, camera) {
  if (state.mode === 'live') {
    const liveCamera = state.live?.cameras?.[String(camera)];
    const frameState = selectCameraFrame(state.live, camera);
    return { mode: 'live', status: liveCamera?.status || 'offline', freshness: frameState.status, frame: frameState.frame, error: liveCamera?.error || 'No frame is available from this camera.', active: true };
  }
  if (state.mode === 'simulation') {
    const active = state.simulation.cameraActive[camera];
    return { mode: 'simulation', status: active ? 'simulated' : 'paused', frame: null, error: active ? null : 'Simulation preview paused.', active };
  }
  return { mode: 'disconnected', status: 'disconnected', frame: null, error: 'Connect the Python backend to access this camera.', active: false };
}

function CameraScene({ camera, state }) {
  const data = getCameraData(state, camera);
  if (data.mode === 'live') {
    if (data.status === 'online' && data.freshness === 'fresh' && data.frame) return <div className="live-frame"><img src={`data:image/jpeg;base64,${data.frame}`} alt={`Live camera ${camera} frame`}/><span className="frame-source">CAMERA {camera} · LIVE</span></div>;
    if (data.status === 'online' && data.freshness === 'stale') return <div className="camera-placeholder error-placeholder"><Icon name="camera" size={26}/><strong>Camera {camera} frame is stale</strong><span>Showing no old frame as current.</span><small>Waiting for a fresh frame from the backend.</small></div>;
    if (data.status === 'online') return <div className="camera-placeholder"><Icon name="camera" size={26}/><strong>Waiting for a fresh frame</strong><span>No current frame is available from camera {camera}.</span></div>;
    return <div className="camera-placeholder error-placeholder"><Icon name="camera" size={26}/><strong>Camera {camera} unavailable</strong><span>{data.error}</span><small>Check camera connection and operating-system permission.</small></div>;
  }
  if (data.mode === 'disconnected') return <div className="camera-placeholder"><Icon name="camera" size={26}/><strong>Waiting for Python backend</strong><span>{data.error}</span></div>;
  if (data.status === 'paused') return <div className="camera-placeholder"><Icon name="camera" size={26}/><strong>Simulation preview paused</strong><span>No camera is connected in simulation mode.</span></div>;
  return <div className={`camera-scene ${camera === 0 ? 'secondary-scene' : ''}`}><div className="scene-grain"/><div className="scene-vignette"/><div className="scene-topline"><span>SIMULATED</span><span>NO CAMERA DATA</span></div>{camera === 1 && state.preferences.showOverlay && state.simulation.targetVisible && state.simulation.trackingEnabled && <span className="simulated-target-box">MOCK TARGET</span>}<div className="scene-bottomline"><span>{camera === 0 ? 'DISPLAY ONLY' : 'SIMULATED TRACKING VIEW'}</span><span>SIMULATION</span></div></div>;
}

function CameraCard({ camera, state, command, compact = false }) {
  const data = getCameraData(state, camera);
  const configuredRole = state.live?.cameras?.[String(camera)]?.role;
  const role = data.mode === 'live'
    ? String(configuredRole || 'configured camera').replaceAll('_', ' ').toUpperCase()
    : camera === 1 ? 'PRIMARY · SIMULATED TRACKING SOURCE' : 'SECONDARY · SIMULATED DISPLAY';
  const active = data.mode === 'live' ? data.status === 'online' : data.status === 'simulated';
  const toggle = async () => {
    if (data.mode === 'live') {
      await command({ type: 'vision.stop' });
      await command({ type: 'vision.start' });
    } else dispatch('SIMULATION_TOGGLE_CAMERA', { camera });
  };
  return <section className={`panel camera-card ${camera === 0 ? 'secondary-card' : ''} ${compact ? 'camera-card-compact' : ''}`}>
    <header className="camera-header"><div className="camera-title"><span className={`camera-number ${camera === 0 ? 'muted-num' : ''}`}>0{camera}</span><div><h3>Camera {camera}</h3><p>{role}</p></div></div><div className={`feed-state ${active ? '' : 'feed-muted'}`}><i/>{data.status === 'online' ? 'CONNECTED' : data.status === 'simulated' ? 'SIMULATED' : data.status === 'paused' ? 'PAUSED' : data.status === 'offline' ? 'OFFLINE' : 'DISCONNECTED'}</div></header>
    <CameraScene camera={camera} state={state}/>
    <footer className="camera-footer"><span><b className={active && data.mode !== 'simulation' ? '' : 'dim-dot'}/>{camera === 0 ? 'Display only' : 'Tracking source'}</span><span>{data.mode === 'live' ? (state.live?.cameras?.[String(camera)]?.fps ?? '—') : '—'} <small>FPS</small></span><span>{data.mode === 'live' ? (state.live?.cameras?.[String(camera)]?.resolution || '—') : data.mode === 'simulation' ? 'SIM' : '—'}</span><button disabled={state.backend.status === 'starting' || (data.mode !== 'simulation' && data.mode !== 'live')} onClick={toggle}>{data.mode === 'live' ? 'Restart vision' : data.mode === 'simulation' ? (active ? 'Pause' : 'Resume') : 'Unavailable'}</button></footer>
  </section>;
}

function StatCard({ label, value, foot, icon, accent }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${accent || ''}`}><Icon name={icon} size={16}/></span></div><div className="stat-value">{value ?? '—'}</div><div className="stat-foot">{foot}</div></div>;
}

function displayData(state) {
  if (state.mode === 'live' && state.live) return state.live;
  if (state.mode !== 'simulation') return null;
  return createDemoSnapshot(state.simulation);
}

function EventRows({ events, emptyText = 'No events have been reported.' }) {
  if (!events.length) return <div className="empty-state">{emptyText}</div>;
  return <div className="event-list">{events.map((item) => <div className="event-row" key={item.id}><div className={`event-icon ${item.kind || 'system'}`}><Icon name={item.kind === 'track' ? 'target' : item.kind === 'camera' ? 'camera' : 'bolt'} size={15}/></div><div className="event-copy"><strong>{item.text}</strong><span>{item.detail}{item.source ? ` · ${item.source}` : ''}</span></div><time>{item.time}</time></div>)}</div>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <section className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="intro-actions">{action}</div>}</section>;
}

function EventPanel({ events, compact = false }) {
  return <section className="panel events-panel"><div className="panel-heading"><div><span className="eyebrow">{events.some((item) => item.source === 'SIMULATION') ? 'SIMULATION ACTIVITY' : 'PYTHON BACKEND ACTIVITY'}</span><h2>Event log</h2></div><button className="text-button" onClick={() => dispatch('NAVIGATE', { page: 'events' })}>View all <Icon name="chevron" size={14}/></button></div><EventRows events={compact ? events.slice(0, 5) : events}/>{events.length === 0 && <div className="mock-note">No backend events yet.</div>}</section>;
}

function PanTiltControls({ data, state, command, motionBusy }) {
  const controller = data?.controller;
  const active = state.mode === 'simulation' ? state.simulation.running : Boolean(controller?.motion_enabled);
  const hasAngles = Number.isFinite(controller?.pan) && Number.isFinite(controller?.tilt);
  const stopLatched = state.mode === 'live' ? Boolean(controller?.stop_latched) : state.mode === 'simulation' && state.simulation.stopLatched;
  const nudge = (axis, direction) => state.mode === 'live' ? command({ type: 'pan_tilt.nudge', axis, direction }) : dispatch('SIMULATION_NUDGE', { axis, direction });
  const toggleMotion = () => state.mode === 'live' ? command({ type: active ? 'motion.stop' : 'motion.start' }) : dispatch(active ? 'SIMULATION_STOP' : 'SIMULATION_START');
  const reset = () => state.mode === 'live' ? command({ type: 'pan_tilt.reset' }) : dispatch('SIMULATION_RESET');
  const ready = state.mode === 'live' || state.mode === 'simulation';
  return <section className="panel control-panel"><div className="control-heading"><div><span className="eyebrow">{state.mode === 'live' ? 'PYTHON SIMULATED CONTROLLER' : 'SIMULATED ACTUATION'}</span><h3>Pan / tilt</h3></div><span className="simulation-tag"><span/>{state.mode === 'live' ? 'HARDWARE DISABLED' : state.mode === 'simulation' ? 'SIMULATION' : 'NOT CONNECTED'}</span></div><div className="angle-readouts"><div><span>PAN</span><strong>{hasAngles ? controller.pan.toFixed(1) : '—'}<small>{hasAngles ? '°' : ''}</small></strong><em>0°–180°</em></div><div><span>TILT</span><strong>{hasAngles ? controller.tilt.toFixed(1) : '—'}<small>{hasAngles ? '°' : ''}</small></strong><em>30°–150°</em></div></div><div className="control-pad"><button disabled={!ready || motionBusy || stopLatched} onClick={() => nudge('tilt', -1)} aria-label="Tilt up">↑</button><div><button disabled={!ready || motionBusy || stopLatched} onClick={() => nudge('pan', -1)} aria-label="Pan left">←</button><button className="pad-center" disabled={!ready || motionBusy} onClick={reset} aria-label="Reset pan and tilt"><Icon name="crosshair" size={17}/></button><button disabled={!ready || motionBusy || stopLatched} onClick={() => nudge('pan', 1)} aria-label="Pan right">→</button></div><button disabled={!ready || motionBusy || stopLatched} onClick={() => nudge('tilt', 1)} aria-label="Tilt down">↓</button></div><button className={`sim-run-button ${active ? 'running' : ''}`} disabled={!ready || motionBusy} onClick={toggleMotion}><Icon name={active ? 'stop' : 'bolt'} size={14}/>{active ? 'STOP SIMULATED MOVEMENT' : stopLatched ? 'RELEASE STOP & START' : state.mode === 'disconnected' ? 'CONNECT BACKEND OR START SIMULATION' : 'START SIMULATED MOVEMENT'}</button><p className="control-safety"><Icon name="shield" size={13}/> Software STOP only · not a physical emergency stop</p></section>;
}

function Overview({ state, data, command, connectBackend, stopBackend, motionBusy }) {
  const tracking = data?.tracking;
  const controller = data?.controller;
  const modeLabel = state.mode === 'live' ? 'PYTHON LIVE TELEMETRY' : state.mode === 'simulation' ? 'LOCAL SIMULATION · CLEARLY LABELED' : 'NO TELEMETRY';
  const action = <><button className="secondary-action" disabled={state.backend.status === 'starting' || state.backend.status === 'stopping'} onClick={state.backend.status === 'connected' ? stopBackend : connectBackend}>{state.backend.status === 'starting' ? 'Starting backend…' : state.backend.status === 'connected' ? 'Stop Python backend' : 'Start Python backend'}</button>{state.mode !== 'live' && <button className="secondary-action sim-choice" onClick={() => dispatch('SIMULATION_START')}>{state.mode === 'simulation' ? 'Resume local simulation' : 'Start local simulation'}</button>}</>;
  return <><PageHeading eyebrow="CONTROL ROOM / SESSION" title="System overview" description="Live telemetry is shown only when received from the local Python service." action={action}/>
    {state.backend.error && <div className="backend-error" role="alert"><strong>Python backend issue</strong><span>{state.backend.error}</span><button onClick={connectBackend}>Retry connection</button></div>}
    <div className="service-strip"><div className="service-strip-title"><span className="eyebrow">CONNECTIONS</span><span className="connection-mode">LOCAL ONLY</span></div><div className="service-items"><ServiceBadge label="Python backend" value={state.backend.status === 'connected' ? data?.vision?.face?.status === 'ready' ? 'Vision active' : 'Connected · cameras off' : state.backend.status} tone={state.backend.status === 'connected' && data?.vision?.face?.status === 'ready' ? 'online' : state.backend.status === 'starting' ? 'neutral' : state.backend.status === 'connected' ? 'neutral' : 'offline'}/><ServiceBadge label="Face recognition" value={data?.recognition?.status === 'ready' ? (data.recognition.enabled ? 'Ready' : 'Disabled') : data?.recognition?.status === 'simulated' ? 'Demo' : 'Unavailable'} tone={data?.recognition?.status === 'ready' ? 'online' : data?.recognition?.status === 'simulated' ? 'neutral' : 'offline'}/><ServiceBadge label="Stereo depth" value={data?.depth?.metric_validation_status === 'VALID' ? 'Validated' : data?.depth?.status === 'ERROR' ? 'Error' : 'Unavailable · UNVALIDATED'} title={data?.depth?.reason} tone={data?.depth?.status === 'ERROR' ? 'offline' : 'neutral'}/><ServiceBadge label="Event delivery" value={data?.event_delivery?.status === 'failed' ? 'Failed' : data?.event_delivery?.status === 'delivered' ? 'Delivered' : data?.event_delivery?.status === 'queued' ? 'Queued' : 'Not configured'} tone={data?.event_delivery?.status === 'failed' ? 'offline' : data?.event_delivery?.status === 'delivered' ? 'online' : 'neutral'}/><ServiceBadge label="ESP32" value="Disconnected" tone="offline"/><ServiceBadge label="AWS" value="Not configured" tone="neutral"/></div></div>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">CAMERA INPUTS</span><h2>Vision feeds</h2></div><span className={`mock-source ${state.mode === 'live' && data?.vision?.face?.status === 'ready' ? 'live-source' : ''}`}><i/>{state.mode === 'live' ? data?.vision?.face?.status === 'ready' ? 'REAL VISION ACTIVE' : 'CAMERAS NOT STARTED' : state.mode === 'simulation' ? 'SIMULATED' : 'DISCONNECTED'}</span></div><div className="camera-grid"><CameraCard camera={1} state={state} command={command}/><CameraCard camera={0} state={state} command={command}/></div></section>
    <section className="section-block telemetry-section"><div className="section-heading compact-heading"><div><span className="eyebrow">{modeLabel}</span><h2>Tracking &amp; positioning</h2></div><span className="telemetry-updated">{state.mode === 'live' ? (data?.updated_at ? new Date(data.updated_at).toLocaleTimeString() : 'WAITING FOR UPDATE') : state.mode === 'simulation' ? `SIM TICK ${state.simulation.ticks}` : 'WAITING FOR BACKEND'}</span></div><div className="telemetry-grid"><div className="stats-grid"><StatCard label="TRACKING STATUS" icon="target" accent={tracking?.has_target ? 'green-icon' : ''} value={tracking?.status} foot={state.mode === 'simulation' ? 'Simulated tracking state' : tracking?.has_target ? 'Python vision backend' : state.mode === 'live' ? 'No current target' : 'Unavailable until backend connects'}/><StatCard label="TARGET IDENTITY" icon="crosshair" value={tracking?.has_target ? tracking.identity : null} foot={tracking?.recognized ? `Recognized · ${(tracking.confidence * 100).toFixed(1)}% confidence` : tracking?.has_target ? 'Unknown / unregistered face' : state.mode === 'simulation' ? 'No mock target active' : 'No identity data'}/><StatCard label="TARGET DIRECTION" icon="arrow" accent="amber-icon" value={tracking?.has_target ? tracking.direction : null} foot={tracking?.has_target ? `X ${tracking.offset_x >= 0 ? '+' : ''}${Number(tracking.offset_x).toFixed(2)} / Y ${tracking.offset_y >= 0 ? '+' : ''}${Number(tracking.offset_y).toFixed(2)}` : 'No current target direction'}/><StatCard label="PAN / TILT" icon="sliders" value={controller && Number.isFinite(controller.pan) ? `${controller.pan.toFixed(1)}° / ${controller.tilt.toFixed(1)}°` : null} foot={state.mode === 'live' ? 'Python simulated controller · degrees' : state.mode === 'simulation' ? 'Local simulated controller · degrees' : 'No telemetry available'}/></div><PanTiltControls data={data} state={state} command={command} motionBusy={motionBusy}/></div></section>
    <EventPanel events={data?.events || []} compact/>
  </>;
}

function CamerasPage({ state, command }) {
  return <><PageHeading eyebrow="WORKSPACE / CAMERA INPUTS" title="Camera feeds" description="Both configured cameras form the stereo pair. Active LEFT/RIGHT and face-source roles appear after real vision starts."/><div className="camera-grid camera-grid-page"><CameraCard camera={1} state={state} command={command}/><CameraCard camera={0} state={state} command={command}/></div><div className="camera-role-note"><Icon name="shield" size={16}/><span>Roles follow the explicit LEFT/RIGHT and face-camera configuration. No camera opens until Start real vision is selected. Frames appear only while current and fresh.</span></div></>;
}

function TrackingPage({ state, data, command }) {
  const tracking = data?.tracking;
  const faceObservations = data?.vision?.face?.observations || [];
  const active = Boolean(tracking?.enabled);
  const toggle = () => state.mode === 'live' ? command({ type: 'tracking.set', enabled: !active }) : dispatch('SIMULATION_TOGGLE_TRACKING');
  const hasControl = state.mode === 'live' || state.mode === 'simulation';
  const faceCamera = ['0', '1'].find((index) => String(data?.cameras?.[index]?.role || '').includes('face_source'));
  const liveSource = faceCamera ? `CAMERA ${faceCamera}` : 'CAMERAS NOT STARTED';
  return <><PageHeading eyebrow="WORKSPACE / TRACKING" title="Target tracking" description={state.mode === 'live' ? 'Target state reported by the Python vision pipeline.' : state.mode === 'simulation' ? 'This view contains local mock tracking values only.' : 'Start the Python backend to receive detections and tracking state.'} action={hasControl && <button className="secondary-action" onClick={toggle}>{active ? 'Pause tracking' : 'Enable tracking'}</button>}/><div className="tracking-layout"><section className="panel tracking-detail"><div className="detail-top"><span className="eyebrow">{state.mode === 'live' ? liveSource : state.mode === 'simulation' ? 'SIMULATED CAMERA' : 'DISCONNECTED'}</span><span className={`status-chip ${tracking?.has_target ? 'good' : 'idle'}`}>{tracking?.status || 'UNAVAILABLE'}</span></div><h2>{tracking?.has_target ? tracking.identity : state.mode === 'live' ? 'No target detected' : state.mode === 'simulation' ? 'No simulated target' : 'Tracking unavailable'}</h2><p>{state.mode === 'live' ? `${faceObservations.length} current face track${faceObservations.length === 1 ? '' : 's'}${tracking?.has_target ? ` · selected track ${tracking.track_id}` : ''}.` : tracking?.has_target ? (tracking.recognized ? 'Identity matched against the local recognition database.' : 'Target detected; identity is unknown or recognition is disabled.') : 'No current target information is available.'}</p><div className="detail-metrics"><div><span>CONFIDENCE</span><strong>{tracking?.has_target && Number.isFinite(tracking.confidence) ? `${(tracking.confidence * 100).toFixed(1)}%${state.mode === 'simulation' ? ' · MOCK' : ''}` : '—'}</strong></div><div><span>DIRECTION</span><strong>{tracking?.has_target ? tracking.direction : '—'}</strong></div><div><span>DEAD ZONE</span><strong>{tracking?.has_target ? (tracking.in_dead_zone ? 'IN' : 'OUT') : '—'}</strong></div></div>{state.mode === 'simulation' && <button className="secondary-action" onClick={() => dispatch('SIMULATION_TOGGLE_TARGET')}>{state.simulation.targetVisible ? 'Simulate target loss' : 'Restore mock target'}</button>}</section><CameraCard camera={1} state={state} command={command}/></div><EventPanel events={data?.events || []} compact/></>;
}

function PanTiltPage({ state, data, command, motionBusy }) {
  const controller = data?.controller;
  const active = state.mode === 'simulation' ? state.simulation.running : Boolean(controller?.motion_enabled);
  const stop = () => state.mode === 'live' ? command({ type: 'motion.stop' }) : dispatch('SIMULATION_STOP');
  const start = () => state.mode === 'live' ? command({ type: 'motion.start' }) : dispatch('SIMULATION_START');
  return <><PageHeading eyebrow="WORKSPACE / POSITIONING" title="Pan / Tilt" description="Manual controls operate the simulated controller only. ESP32 output is disconnected and disabled." action={state.mode !== 'disconnected' && <button className={`stop-button ${active ? 'active-stop' : ''}`} disabled={motionBusy || (state.mode === 'simulation' && !active)} onClick={stop}><Icon name="stop" size={12}/>{active ? 'SOFTWARE STOP' : 'STOPPED'}</button>}/><div className="position-layout"><PanTiltControls data={data} state={state} command={command} motionBusy={motionBusy}/><section className="panel position-info"><span className="eyebrow">HARDWARE INTERLOCK</span><div className="lock-icon"><Icon name="shield" size={24}/></div><h2>Hardware output disabled</h2><p>Pan and tilt values are simulation telemetry. Connecting the Python backend does not open an ESP32 serial connection or enable hardware output.</p><div className="interlock-row"><span>Python backend</span><strong>{state.backend.status.toUpperCase()}</strong></div><div className="interlock-row"><span>ESP32</span><strong>DISCONNECTED</strong></div><div className="interlock-row"><span>AWS</span><strong>NOT CONFIGURED</strong></div>{state.mode === 'disconnected' && <button className="secondary-action" onClick={start}>Start local simulation</button>}</section></div><div className="physical-estop-note"><Icon name="shield" size={16}/><span>Software STOP halts this application's simulated motion. It is not a physical emergency stop.</span></div><EventPanel events={data?.events || []} compact/></>;
}

function EventsPage({ events }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const filtered = useMemo(() => events.filter((item) => (kind === 'all' || item.kind === kind) && `${item.text} ${item.detail} ${item.source || ''}`.toLowerCase().includes(query.toLowerCase())), [events, kind, query]);
  function exportEvents() {
    const rows = [['time', 'kind', 'source', 'event', 'detail'], ...filtered.map((item) => [item.time, item.kind, item.source || '', item.text, item.detail])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'aura-events.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return <><PageHeading eyebrow="WORKSPACE / AUDIT" title="Event history" description="Search and filter events received from the active source." action={<button className="secondary-action" disabled={!events.length} onClick={exportEvents}><Icon name="download" size={15}/> Export CSV</button>}/><section className="panel event-filter-panel"><label className="event-search"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search event text or detail" aria-label="Search event history"/></label><label className="event-kind-filter"><span>TYPE</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All events</option><option value="system">System</option><option value="camera">Camera</option><option value="track">Tracking</option><option value="error">Errors</option></select></label><button className="text-button" onClick={() => { setQuery(''); setKind('all'); }}>Reset filters</button><span className="filter-count">{filtered.length} / {events.length}</span></section><section className="panel events-panel full-events"><EventRows events={filtered} emptyText={events.length ? 'No events match these filters.' : 'No events have been received from the current source.'}/></section></>;
}

function PreferencesPage({ state, command, connectBackend, stopBackend, motionBusy }) {
  const recognition = state.live?.recognition;
  const setPreference = (key, value) => dispatch('PREFERENCE_SET', { key, value });
  const visionStatus = state.live?.vision?.face?.status;
  const visionStarting = visionStatus === 'loading';
  return <><PageHeading eyebrow="SYSTEM / PREFERENCES" title="Preferences" description="Local display settings and backend lifecycle controls."/><section className="panel preferences-panel"><div className="preference-row"><div><strong>Target overlay</strong><p>Show a target marker only when an actual target or explicit simulation target exists.</p></div><button className={`toggle ${state.preferences.showOverlay ? 'on' : ''}`} role="switch" aria-checked={state.preferences.showOverlay} aria-label="Target overlay" onClick={() => setPreference('showOverlay', !state.preferences.showOverlay)}><span/></button></div><div className="preference-row"><div><strong>Simulated auto-follow</strong><p>Move local simulation angles while its simulation is running.</p></div><button className={`toggle ${state.preferences.autoFollow ? 'on' : ''}`} role="switch" aria-checked={state.preferences.autoFollow} aria-label="Simulated auto-follow" onClick={() => setPreference('autoFollow', !state.preferences.autoFollow)}><span/></button></div><div className="preference-row"><div><strong>Face recognition</strong><p>Use the private local identity database only during explicit real-vision sessions.</p></div><button className={`toggle ${recognition?.enabled ? 'on' : ''}`} disabled={state.mode !== 'live' || recognition?.status === 'disabled'} role="switch" aria-checked={Boolean(recognition?.enabled)} aria-label="Face recognition" onClick={() => command({ type: 'recognition.set', enabled: !recognition?.enabled })}><span/></button></div><div className="preference-row"><div><strong>Python vision backend</strong><p>{state.backend.error || 'Connect starts the local API only. It does not open cameras.'}</p></div><button className="secondary-action" disabled={state.backend.status === 'starting' || state.backend.status === 'stopping'} onClick={state.backend.status === 'connected' ? stopBackend : connectBackend}>{state.backend.status === 'connected' ? 'Stop backend' : state.backend.status === 'starting' ? 'Starting…' : 'Connect backend'}</button></div><div className="preference-row"><div><strong>Real camera vision</strong><p>{state.live?.vision?.face?.error || (visionStarting ? 'Loading local models and opening the configured cameras. This can take a while.' : 'Explicitly opens the configured LEFT/RIGHT camera pair and local face models. Metric depth stays unvalidated.')}</p></div>{state.mode === 'live' && <button className="secondary-action" disabled={motionBusy || visionStarting} onClick={() => command({ type: visionStatus === 'ready' ? 'vision.stop' : 'vision.start' })}>{visionStarting ? 'Starting real vision…' : visionStatus === 'ready' ? 'Stop real vision' : 'Start real vision'}</button>}</div><div className="preference-row"><div><strong>ESP32 hardware output</strong><p>Not connected. This milestone does not provide a hardware enable path.</p></div><span className="static-status disconnected">DISCONNECTED · DISABLED</span></div><div className="preference-row"><div><strong>AWS cloud services</strong><p>No AWS client or resource configuration is present.</p></div><span className="static-status">NOT CONFIGURED</span></div></section><div className="settings-status"><span>AURA stores UI preferences in memory for this session.</span></div></>;
}

export default function App() {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [motionBusy, setMotionBusy] = useState(false);

  async function refreshBackend() {
    if (!window.auraDesktop) return;
    try {
      const result = await window.auraDesktop.getSnapshot();
      if (result?.snapshot) dispatch('BACKEND_SNAPSHOT', result);
      else dispatch('BACKEND_STATUS', result?.connection || { status: 'disconnected' });
    } catch (error) {
      dispatch('BACKEND_DISCONNECTED', { error: error.message });
    }
  }

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (!window.auraDesktop || cancelled) return;
      try {
        const result = await window.auraDesktop.getSnapshot();
        if (cancelled) return;
        if (result?.snapshot) dispatch('BACKEND_SNAPSHOT', result);
        else dispatch('BACKEND_STATUS', result?.connection || { status: 'disconnected' });
      } catch (error) {
        if (!cancelled) dispatch('BACKEND_DISCONNECTED', { error: error.message });
      }
    };
    poll();
    const timer = window.setInterval(poll, 700);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (state.mode === 'simulation' && state.simulation.running) store.startSimulationClock();
    else store.stopSimulationClock();
    return () => store.stopSimulationClock();
  }, [state.mode, state.simulation.running]);

  async function connectBackend() {
    if (!window.auraDesktop) { dispatch('BACKEND_STATUS', { status: 'error', error: 'The Electron preload bridge is unavailable.' }); return; }
    dispatch('BACKEND_STATUS', { status: 'starting' });
    try {
      if (state.backend.status === 'error') await window.auraDesktop.stopBackend();
      await window.auraDesktop.startBackend();
      await refreshBackend();
    } catch (error) {
      dispatch('BACKEND_STATUS', { status: 'error', error: error.message });
    }
  }

  async function stopBackend() {
    if (!window.auraDesktop) return;
    dispatch('BACKEND_STATUS', { status: 'stopping' });
    try { await window.auraDesktop.stopBackend(); dispatch('BACKEND_DISCONNECTED', {}); }
    catch (error) { dispatch('BACKEND_DISCONNECTED', { error: error.message }); }
  }

  async function command(message) {
    if (!window.auraDesktop) { dispatch('BACKEND_COMMAND_ERROR', { error: 'Electron command bridge unavailable.' }); return; }
    setMotionBusy(true);
    try {
      const snapshot = await window.auraDesktop.sendCommand(message);
      dispatch('BACKEND_SNAPSHOT', { connection: { status: 'connected' }, snapshot });
    } catch (error) {
      dispatch('BACKEND_COMMAND_ERROR', { error: error.message });
    } finally { setMotionBusy(false); }
  }

  const data = displayData(state);
  const events = data?.events || [];
  const active = state.mode === 'simulation' ? state.simulation.running : Boolean(data?.controller?.motion_enabled);
  const stopAction = () => state.mode === 'live' ? command({ type: 'motion.stop' }) : dispatch('SIMULATION_STOP');
  let content;
  if (state.page === 'overview') content = <Overview state={state} data={data} command={command} connectBackend={connectBackend} stopBackend={stopBackend} motionBusy={motionBusy}/>;
  else if (state.page === 'cameras') content = <CamerasPage state={state} command={command}/>;
  else if (state.page === 'tracking') content = <TrackingPage state={state} data={data} command={command}/>;
  else if (state.page === 'pan-tilt') content = <PanTiltPage state={state} data={data} command={command} motionBusy={motionBusy}/>;
  else if (state.page === 'events') content = <EventsPage events={events}/>;
  else content = <PreferencesPage state={state} command={command} connectBackend={connectBackend} stopBackend={stopBackend} motionBusy={motionBusy}/>;

  return <div className="app-shell"><Sidebar current={state.page}/><main className="main-content">
    <header className="topbar"><div className="breadcrumb"><span>AURA</span><Icon name="chevron" size={13}/><strong>{titles[state.page]}</strong></div><div className="topbar-right"><div className={`preview-pill ${state.mode === 'live' ? 'live-pill' : ''}`}><span/>{state.mode === 'live' ? 'PYTHON BACKEND' : state.mode === 'simulation' ? 'SIMULATION MODE' : state.backend.status === 'starting' ? 'CONNECTING' : 'DISCONNECTED'}</div><div className="topbar-divider"/><button className="icon-button" aria-label="Open preferences" onClick={() => dispatch('NAVIGATE', { page: 'preferences' })}><Icon name="shield"/></button><div className="system-time"><span>{state.mode === 'live' ? 'BACKEND' : state.mode === 'simulation' ? 'LOCAL SIMULATION' : 'PYTHON VISION'}</span><strong>{state.backend.status === 'starting' ? 'STARTING' : state.mode === 'live' ? 'CONNECTED' : state.mode === 'simulation' ? `TICK ${String(state.simulation.ticks).padStart(4, '0')}` : state.backend.status.toUpperCase()}</strong></div></div></header>
    <div className="page-content">{content}<footer className="page-footer"><span>AURA CONTROL ROOM <b>·</b> UI 0.3.0</span><span>{state.mode === 'live' ? 'LIVE PYTHON DATA' : state.mode === 'simulation' ? 'SIMULATED VALUES' : 'NO LIVE DATA'} <b>·</b> ESP32 DISCONNECTED</span></footer></div>
    {state.mode !== 'disconnected' && <button className="global-stop" disabled={!active || motionBusy} onClick={stopAction} title="Software stop only; not a physical emergency stop"><Icon name="stop" size={12}/>{active ? 'SOFTWARE STOP' : 'MOTION STOPPED'}</button>}
  </main></div>;
}
