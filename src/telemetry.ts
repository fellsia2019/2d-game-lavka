// Local diagnostic events only: nothing is sent to a server.
export interface PlayEvent {
  event: string;
  at: string;
  order?: string;
  data?: Record<string, number | string | boolean>;
}
const events: PlayEvent[] = [];
export function track(event: string, order?: string, data?: PlayEvent["data"]) {
  events.push({ event, at: new Date().toISOString(), order, data });
  if (events.length > 1000) events.shift();
}
export function downloadEvents() {
  const blob = new Blob([JSON.stringify({ version: 1, events }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "lavka-playtest.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
