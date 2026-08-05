import { html, signal } from "balises";
import { mount } from "balises/hmr";
import "./child.ts"; // side-effect: mounts its own region and opts into HMR

// Module-scope state. On a hot reload this signal is recreated by the
// module re-execution, and mount() carries the old value into the new
// instance ("state wins" — exactly like React Fast Refresh).
const count = signal(0);
const text = signal("");

// An inline "component": a template inside a slot. On a reload this is a
// new template instance with the same static source, so the slot re-binds
// it in place — the nodes around it (and their focus) are untouched.
const counter = () => html`
  <button @click=${() => count.update((n) => n + 4)}>
    clicked ${count} times — label edited live!
  </button>
`;

mount(
  document.querySelector("#app")!,
  html`
    <div class="box">${counter()}</div>
    <div class="box">
      <input
        .value=${text}
        @input=${(e: Event) => (text.value = (e.target as HTMLInputElement).value)}
        placeholder="type here"
      />
      <p>you typed: <strong>${text}</strong></p>
    </div>
  `,
);

// Vite: opt in to hot updates for this module instead of a full page reload.
import.meta.hot?.accept();
