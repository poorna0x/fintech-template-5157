/** In-memory store for WhatsApp webhook POC (local / warm Netlify instances). */
const MAX = 50;
const events = [];

function pushEvent(entry) {
  events.unshift({
    receivedAt: new Date().toISOString(),
    ...entry,
  });
  if (events.length > MAX) events.length = MAX;
  return events[0];
}

function listEvents() {
  return events.slice();
}

function clearEvents() {
  events.length = 0;
}

module.exports = { pushEvent, listEvents, clearEvents };
