import { html, signal } from "./examples/balises.esm.js";

const count = signal(0);

const app = html`
  <button @click=${() => count.value++}>Clicked: ${count}</button>
`;

document.body.appendChild(app.render().fragment);
