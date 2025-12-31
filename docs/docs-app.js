// Root application component - renders the entire docs site using Balises
// Demonstrates data-driven template composition

import { html, computed, store } from "./examples/balises.esm.js";

// ============================================================================
// Data Structures
// ============================================================================

const FEATURES = [
  {
    title: "Tiny bundle size",
    desc: "Just ~3KB gzipped, zero dependencies",
  },
  {
    title: "Fine-grained reactivity",
    desc: "Only updates what changed, without virtual DOM overhead",
  },
  {
    title: "Signals & computed",
    desc: "Automatic dependency tracking with lazy evaluation",
  },
  {
    title: "Keyed list rendering",
    desc: "Efficient <code>each()</code> with DOM node recycling",
  },
  {
    title: "No build required",
    desc: "Works directly in browsers with ES modules",
  },
  {
    title: "Non-recursive propagation",
    desc: "Handles deep dependency chains without stack overflow",
  },
  {
    title: "Standalone signals",
    desc: "Use the reactivity system independently in any JavaScript project",
  },
];

const API_ITEMS = [
  {
    title: "signal(value)",
    code: "signal",
    desc: "Creates a reactive value. Reading <code>.value</code> inside a computed tracks it as a dependency.",
  },
  {
    title: "computed(fn)",
    code: "computed",
    desc: "Creates a derived value that automatically recomputes when dependencies change.",
  },
  {
    title: "effect(fn)",
    code: "effect",
    desc: "Essentially a computed with an automatic subscription, making it eager rather than lazy.",
  },
  {
    title: "store(object)",
    code: "store",
    desc: "Wraps a plain object making all properties reactive. Nested objects are wrapped automatically.",
  },
  {
    title: "html\\`...\\`",
    code: "html",
    desc: "Tagged template for reactive HTML. Use <code>@event</code> for events, <code>.prop</code> for properties.",
  },
  {
    title: "each(list, keyFn?, renderFn)",
    code: "each",
    desc: "Efficient keyed list rendering. Reuses DOM nodes when items are reordered.",
  },
  {
    title: "batch(fn)",
    code: "batch",
    desc: "Batches multiple signal updates into a single notification pass.",
  },
  {
    title: "scope(fn)",
    code: "scope",
    desc: "Creates a disposal scope that collects all computeds and effects, allowing cleanup with a single <code>dispose()</code> call.",
  },
];

const EXAMPLES = [
  {
    href: "./examples/counter/",
    name: "Counter",
    desc: "Simple reactive counter",
  },
  {
    href: "./examples/timer/",
    name: "Timer",
    desc: "Interval-based updates",
  },
  {
    href: "./examples/todo-list/",
    name: "Todo List",
    desc: "CRUD with keyed list rendering",
  },
  {
    href: "./examples/pokemon/",
    name: "Pokemon",
    desc: "Async data fetching",
  },
  {
    href: "./examples/performance/",
    name: "Performance Demo",
    desc: "Surgical reactivity at high speed",
  },
];

const CODE_EXAMPLES = {
  quickstart: null, // Will be loaded from quickstart-demo.js
  webcomponent: null, // Will be loaded from counter-demo.js

  standalone:
    'import { signal, computed, effect } from "balises/signals";\n' +
    "\n" +
    "// Reactive state without DOM\n" +
    "const users = signal([]);\n" +
    "const userCount = computed(() => users.value.length);\n" +
    "\n" +
    "effect(() => {\n" +
    "  console.log(`Total users: ${userCount.value}`);\n" +
    "});\n" +
    "\n" +
    'users.value = [{ name: "Alice" }, { name: "Bob" }];\n' +
    '// Logs: "Total users: 2"',

  signal:
    "const count = signal(0);\n" +
    "count.value;      // read: 0\n" +
    "count.value = 5;  // write: triggers updates\n" +
    "count.update(n => n + 1); // functional update\n" +
    "count.subscribe(() => console.log('changed!'));",

  computed:
    "const double = computed(() => count.value * 2);\n" +
    "double.value;     // auto-updates when count changes\n" +
    "double.dispose(); // cleanup when done",

  effect:
    "const dispose = effect(() => {\n" +
    "  console.log('Count:', count.value);\n" +
    "  localStorage.setItem('count', count.value);\n" +
    "});\n" +
    "// Runs immediately, re-runs when count changes\n" +
    "dispose(); // cleanup when done",

  store:
    "const state = store({ count: 0, user: { name: 'Alice' } });\n" +
    "state.count++;           // reactive\n" +
    "state.user.name = 'Bob'; // nested objects too",

  html:
    "const tmpl = html`\n" +
    "  <div class=${className}>       <!-- reactive attribute -->\n" +
    "    ${text}                      <!-- reactive text -->\n" +
    "    <input .value=${value} />    <!-- property binding -->\n" +
    "    <button @click=${handler}>   <!-- event binding -->\n" +
    "  </div>\n" +
    "`;\n" +
    "const { fragment, dispose } = tmpl.render();",

  each:
    "// With key function (recommended)\n" +
    "${each(items, i => i.id, i => html`<li>${i.name}</li>`)}\n" +
    "\n" +
    "// Without key (uses object reference or index)\n" +
    "${each(items, i => html`<li>${i.name}</li>`)}\n" +
    "\n" +
    "// With getter function (for stores)\n" +
    "${each(() => state.items, i => html`<li>${i}</li>`)}",

  batch:
    "batch(() => {\n" +
    "  count.value = 1;\n" +
    "  name.value = 'Alice';\n" +
    "  items.value = [...items.value, newItem];\n" +
    "}); // subscribers notified once at the end",

  scope:
    "const [state, dispose] = scope(() => {\n" +
    "  const count = signal(0);\n" +
    "  const doubled = computed(() => count.value * 2);\n" +
    "  effect(() => console.log(doubled.value));\n" +
    "  return { count, doubled };\n" +
    "});\n" +
    "// Use state.count, state.doubled...\n" +
    "dispose(); // cleanup everything at once",

  composable:
    "// Define reusable UI pieces as functions\n" +
    "function Counter({ state, onIncrement }) {\n" +
    "  return html`\n" +
    '    <div class="counter">\n' +
    "      <span>Count: ${() => state.count}</span>\n" +
    "      <button @click=${onIncrement}>+1</button>\n" +
    "    </div>\n" +
    "  `;\n" +
    "}\n" +
    "\n" +
    "// Use in parent - pass store for reactivity\n" +
    "const state = store({ count: 0 });\n" +
    "\n" +
    "html`\n" +
    '  <div class="app">\n' +
    "    ${Counter({ state, onIncrement: () => state.count++ })}\n" +
    "  </div>\n" +
    "`.render();",
};

// ============================================================================
// Root Component
// ============================================================================

// Helper to render feature items
function renderFeatures() {
  return FEATURES.map(
    (f) => html`<feature-item title=${f.title} desc=${f.desc}></feature-item>`,
  );
}

// Helper to render API items
function renderApiItems() {
  return API_ITEMS.map(
    (item) => html`
      <api-item
        title=${item.title}
        data-code=${item.code}
        desc=${item.desc}
      ></api-item>
    `,
  );
}

// Helper to render example cards
function renderExamples() {
  return EXAMPLES.map(
    (ex) => html`
      <example-card
        href=${ex.href}
        name=${ex.name}
        desc=${ex.desc}
      ></example-card>
    `,
  );
}

// ============================================================================
// Root Component
// ============================================================================

class DocsApp extends HTMLElement {
  connectedCallback() {
    // Create reactive store from code examples
    const codeExamples = store(CODE_EXAMPLES);

    // Render the entire application
    const { fragment, dispose } = html`
      <div class="container">
        <!-- Header -->
        <header>
          <img src="./assets/logo.svg" alt="balises" width="280" />
          <p class="tagline">
            Reactive HTML templating for building websites and web components
          </p>
          <div class="badges">
            <span class="badge"><strong>~3.0KB</strong> gzipped</span>
            <span class="badge"><strong>Zero</strong> dependencies</span>
            <span class="badge"><strong>TypeScript</strong> native</span>
          </div>
        </header>

        <!-- Navigation Links -->
        <header>
          <div class="links">
            <a href="https://github.com/elbywan/balises" class="btn github">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
                />
              </svg>
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/balises" class="btn npm">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z"
                />
              </svg>
              npm
            </a>
            <a href="#examples" class="btn examples">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Examples
            </a>
          </div>
        </header>

        <!-- Install Section -->
        <section>
          <h2>Install</h2>
          <install-tabs></install-tabs>
        </section>

        <!-- Quick Start Section -->
        <section>
          <h2>Quick Start</h2>
          <code-block data-code="quickstart"></code-block>
        </section>

        <!-- Features Section (data-driven) -->
        <section>
          <h2>Features</h2>
          <div class="features">
            ${computed(() =>
              FEATURES.map(
                (f) => html`
                  <feature-item title=${f.title} desc=${f.desc}></feature-item>
                `,
              ),
            )}
          </div>
        </section>

        <!-- Web Component Section -->
        <section>
          <h2>Web Component</h2>
          <p>Works naturally with custom elements. No framework needed:</p>
          <code-block data-code="webcomponent"></code-block>

          <br />
          <p class="demo-label">Try it:</p>
          <div class="demo">
            <my-counter></my-counter>
          </div>
        </section>

        <!-- Standalone Signals Section -->
        <section>
          <h2>Standalone Signals</h2>
          <p>
            Use the reactivity system without any HTML templating - works in
            Node.js, Electron, or any JavaScript environment:
          </p>
          <code-block data-code="standalone"></code-block>
        </section>

        <!-- Composable Function Components Section -->
        <section>
          <h2>Composable Functions</h2>
          <p>
            Build reusable UI pieces as functions that return templates. Pass
            the store directly to keep reactivity working - access properties
            inside function wrappers like <code>\${() => state.count}</code>:
          </p>
          <code-block data-code="composable"></code-block>
        </section>

        <!-- API Section (data-driven) -->
        <section>
          <h2>API</h2>
          <div class="api-grid">
            ${computed(() =>
              API_ITEMS.map(
                (item) => html`
                  <api-item
                    title=${item.title}
                    data-code=${item.code}
                    desc=${item.desc}
                  ></api-item>
                `,
              ),
            )}
          </div>
        </section>

        <!-- Examples Section (data-driven) -->
        <section id="examples">
          <h2>Examples</h2>
          <div class="examples">
            ${computed(() =>
              EXAMPLES.map(
                (ex) => html`
                  <example-card
                    href=${ex.href}
                    name=${ex.name}
                    desc=${ex.desc}
                  ></example-card>
                `,
              ),
            )}
          </div>
        </section>

        <!-- Footer -->
        <footer>
          <p>
            MIT License &middot; Made by
            <a href="https://github.com/elbywan">@elbywan</a>
          </p>
          <p>
            This page is built with balises &middot;
            <a
              href="https://github.com/elbywan/balises/blob/main/docs/index.html"
              >View Source</a
            >
          </p>
        </footer>
      </div>
    `.render();

    this.appendChild(fragment);
    this._dispose = dispose;

    // Start loading demo code and setup code blocks
    this.loadDemoCode(codeExamples);
    this.setupCodeBlocks(codeExamples);
  }

  // Fetch and load demo code files
  async loadDemoCode(codeExamples) {
    try {
      const quickstartResponse = await fetch("./quickstart-demo.js");
      const quickstartCode = await quickstartResponse.text();
      codeExamples.quickstart = quickstartCode.replace(
        "./examples/balises.esm.js",
        "balises",
      );

      const webcomponentResponse = await fetch("./counter-demo.js");
      const webcomponentCode = await webcomponentResponse.text();
      codeExamples.webcomponent = webcomponentCode.replace(
        "./examples/balises.esm.js",
        "balises",
      );
    } catch (error) {
      console.error("Failed to load demo code:", error);
    }
  }

  // Reactively populate code blocks when examples are loaded
  setupCodeBlocks(codeExamples) {
    this.querySelectorAll("code[data-code]").forEach((codeEl) => {
      const exampleKey = codeEl.dataset.code;
      const exampleCode = computed(() => codeExamples[exampleKey]);

      // Subscribe to changes and update the DOM
      exampleCode.subscribe(() => {
        if (exampleCode.value) {
          codeEl.textContent = exampleCode.value;
          if (window.Prism) {
            window.Prism.highlightElement(codeEl);
          }
        }
      });

      // Set initial value if available
      if (exampleCode.value) {
        codeEl.textContent = exampleCode.value;
        if (window.Prism) {
          window.Prism.highlightElement(codeEl);
        }
      }
    });
  }

  disconnectedCallback() {
    this._dispose?.();
  }
}

customElements.define("docs-app", DocsApp);
