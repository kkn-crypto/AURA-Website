const { contextBridge, ipcRenderer } = require('electron');

const commandKinds = new Set([
  'motion.start', 'motion.stop', 'tracking.set', 'recognition.set', 'vision.start', 'vision.stop',
  'pan_tilt.reset', 'pan_tilt.nudge',
]);

function validateCommand(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || !commandKinds.has(message.type)) {
    throw new TypeError('Unsupported AURA command');
  }
  if (message.type === 'tracking.set' || message.type === 'recognition.set') {
    if (Object.keys(message).sort().join(',') !== 'enabled,type' || typeof message.enabled !== 'boolean') throw new TypeError('Invalid enabled command');
  } else if (message.type === 'pan_tilt.nudge') {
    if (Object.keys(message).sort().join(',') !== 'axis,direction,type' || !['pan', 'tilt'].includes(message.axis) || ![-1, 1].includes(message.direction)) throw new TypeError('Invalid pan/tilt command');
  } else if (Object.keys(message).join(',') !== 'type') {
    throw new TypeError('Unexpected command fields');
  }
  return message;
}

contextBridge.exposeInMainWorld('auraDesktop', Object.freeze({
  getStatus: () => ipcRenderer.invoke('aura:status'),
  getSnapshot: () => ipcRenderer.invoke('aura:snapshot'),
  startBackend: () => ipcRenderer.invoke('aura:start'),
  stopBackend: () => ipcRenderer.invoke('aura:stop'),
  sendCommand: (command) => ipcRenderer.invoke('aura:command', validateCommand(command)),
}));
