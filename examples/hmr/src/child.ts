import { html, signal } from "balises";
import { mount } from "balises/hmr";

// This module mounts its own region and opts into HMR itself: editing
// child.ts re-executes only this module, so the #app region is left
// completely untouched (and vice versa).
const items = signal(["apple", "banana", "cherry", "durian"]);

mount(
  document.querySelector("#child-area")!,
  html`
    <strong>child module</strong> — edit <code>src/child.ts</code>, the main app
    is untouched
    <ul>
      ${() => items.value.map((item) => html`<li>${item}</li>`)}
    </ul>
  `,
);

import.meta.hot?.accept();
