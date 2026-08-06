import { html, signal } from "balises";

// Module-scope state: on a hot reload this signal is recreated and the
// root's slot re-binding carries the old value into the new instance
// ("state wins" — exactly like React Fast Refresh).
const count = signal(0);

export function Counter() {
  return html`
    <strong>counter component</strong> — edit <code>src/counter.ts</code>
    <br />
    <button @click=${() => count.update((n) => n + 2)}>
      clicked ${count} times
    </button>
  `;
}
