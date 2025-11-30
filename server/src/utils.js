const { randomUUID } = require('crypto');
const WebSocket = require('ws');
const { NETWORK_LATENCY_MS } = require('./config');

function shortId(size = 6) {
  return randomUUID().replace(/-/g, '').slice(0, size);
}

function sendWithLatency(ws, payload, latencyMs = NETWORK_LATENCY_MS) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, latencyMs);
}

module.exports = {
  shortId,
  sendWithLatency,
};
