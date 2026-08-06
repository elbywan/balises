import { html } from "balises";
import { mount } from "balises/hmr";
import { Counter } from "./counter.ts";
import { TextField } from "./fields.ts";
import { List } from "./list.ts";

// The real-app shape: ONE root mount, nested "components" imported from
// separate modules and rendered inside the root template's slots.
mount(
  document.querySelector("#app")!,
  html`
    <h1>balises HMR playground</h1>
    <p class="hint">
      Click the counter, type in the input — then edit
      <code>src/counter.ts</code>, <code>src/fields.ts</code> or
      <code>src/list.ts</code> and save. Only the edited component's region
      updates; the others keep their DOM, state and focus. Editing a component's
      static markup replaces just that region.
    </p>
    <div class="box">${Counter()}</div>
    <div class="box">${TextField()}</div>
    <div class="box">${List()}</div>
  `,
);

// accept() belongs ONLY in modules that call mount(). The component
// modules must NOT accept: if they did, an edit would re-execute them
// without the root re-running, and nothing would update.
import.meta.hot?.accept();
