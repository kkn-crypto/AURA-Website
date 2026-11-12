import test from 'node:test';
import assert from 'node:assert/strict';
import { auraReducer, createDemoSnapshot, createInitialState, isContractSnapshot, selectCameraFrame } from './auraStore.js';

test('starts disconnected without invented telemetry or events', () => {
  const state = createInitialState();
  assert.equal(state.mode, 'disconnected');
  assert.equal(state.live, null);
  assert.deepEqual(state.simulation.events, []);
  assert.equal(state.simulation.angles, null);
});

test('local simulation drives tracking, angles and explicitly sourced events', () => {
  let state = auraReducer(createInitialState(), { type: 'SIMULATION_START' });
  assert.equal(state.mode, 'simulation');
  assert.equal(state.simulation.running, true);
  assert.equal(state.simulation.events[0].source, 'SIMULATION');
  const eventCount = state.simulation.events.length;
  state = auraReducer(state, { type: 'SIMULATION_START' });
  assert.equal(state.simulation.events.length, eventCount);
  const before = state.simulation.angles.pan;
  state = auraReducer(state, { type: 'SIMULATION_NUDGE', axis: 'pan', direction: 1 });
  assert.equal(state.simulation.angles.pan, before + 1);
  state = auraReducer(state, { type: 'SIMULATION_TICK' });
  assert.equal(state.simulation.ticks, 1);
  assert.equal(state.simulation.direction, 'RIGHT');
});

test('software STOP latches manual motion until simulation is restarted', () => {
  let state = auraReducer(createInitialState(), { type: 'SIMULATION_START' });
  state = auraReducer(state, { type: 'SIMULATION_STOP' });
  assert.equal(state.simulation.running, false);
  assert.equal(state.simulation.stopLatched, true);
  const stoppedAngle = state.simulation.angles.pan;
  state = auraReducer(state, { type: 'SIMULATION_NUDGE', axis: 'pan', direction: 1 });
  assert.equal(state.simulation.angles.pan, stoppedAngle);
  state = auraReducer(state, { type: 'SIMULATION_START' });
  assert.equal(state.simulation.stopLatched, false);
  state = auraReducer(state, { type: 'SIMULATION_NUDGE', axis: 'pan', direction: 1 });
  assert.equal(state.simulation.angles.pan, stoppedAngle + 1);
});

test('manual simulation movement respects pan and tilt bounds', () => {
  let state = auraReducer(createInitialState(), { type: 'SIMULATION_START' });
  state = { ...state, simulation: { ...state.simulation, angles: { pan: 180, tilt: 30 } } };
  state = auraReducer(state, { type: 'SIMULATION_NUDGE', axis: 'pan', direction: 1 });
  state = auraReducer(state, { type: 'SIMULATION_NUDGE', axis: 'tilt', direction: -1 });
  assert.equal(state.simulation.angles.pan, 180);
  assert.equal(state.simulation.angles.tilt, 30);
});

test('backend snapshots replace telemetry with live source, disconnection clears it', () => {
  const snapshot = createDemoSnapshot(createInitialState().simulation);
  snapshot.mode = 'live';
  snapshot.backend.status = 'running';
  snapshot.cameras['1'].status = 'online';
  snapshot.cameras['0'].status = 'offline';
  snapshot.recognition.status = 'ready';
  snapshot.vision.face.status = 'ready';
  snapshot.events = [{ id: 'e', source: 'PYTHON BACKEND' }];
  let state = auraReducer(createInitialState(), { type: 'BACKEND_SNAPSHOT', connection: { status: 'connected' }, snapshot });
  assert.equal(state.mode, 'live');
  assert.equal(state.live.events[0].source, 'PYTHON BACKEND');
  state = auraReducer(state, { type: 'BACKEND_DISCONNECTED' });
  assert.equal(state.mode, 'disconnected');
  assert.equal(state.live, null);
});

test('demo creates the same versioned snapshot interface without hardware or metric depth', () => {
  const snapshot = createDemoSnapshot(createInitialState().simulation);
  assert.equal(isContractSnapshot(snapshot), true);
  assert.equal(snapshot.mode, 'demo');
  assert.equal(snapshot.cameras['1'].frame_freshness, 'unavailable');
  assert.equal(snapshot.depth.metric_validation_status, 'UNVALIDATED');
  assert.equal(snapshot.depth.distance_mm, null);
  assert.equal(snapshot.event_delivery.status, 'not_configured');
});

test('stale or unavailable camera frames are never selected as current UI frames', () => {
  const snapshot = createDemoSnapshot(createInitialState().simulation);
  snapshot.cameras['1'].status = 'online';
  snapshot.cameras['1'].frame_freshness = 'stale';
  snapshot.frames['1'] = 'old-frame';
  assert.deepEqual(selectCameraFrame(snapshot, 1), { status: 'stale', frame: null });
  snapshot.cameras['1'].frame_freshness = 'fresh';
  assert.deepEqual(selectCameraFrame(snapshot, 1), { status: 'fresh', frame: 'old-frame' });
  snapshot.cameras['1'].frame_freshness = 'unavailable';
  assert.deepEqual(selectCameraFrame(snapshot, 1), { status: 'unavailable', frame: null });
});

test('unsupported or incomplete backend snapshots enter an explicit error state', () => {
  const state = createInitialState();
  const missing = auraReducer(state, { type: 'BACKEND_SNAPSHOT', connection: { status: 'connected' }, snapshot: { backend: { status: 'running' } } });
  assert.equal(missing.mode, 'disconnected');
  assert.equal(missing.backend.status, 'error');
  const invalid = createDemoSnapshot(state.simulation);
  invalid.depth.metric_validation_status = 'TRUSTED';
  assert.equal(isContractSnapshot(invalid), false);
});

test('navigation and preferences change the shared application state', () => {
  let state = auraReducer(createInitialState(), { type: 'NAVIGATE', page: 'events' });
  state = auraReducer(state, { type: 'PREFERENCE_SET', key: 'showOverlay', value: false });
  assert.equal(state.page, 'events');
  assert.equal(state.preferences.showOverlay, false);
});
