// Reactive web components built with Balises
// These components actually need reactivity!

import { html, signal, computed } from "./examples/balises.esm.js";

// Code block with reactive copy button
class CodeBlock extends HTMLElement {
  connectedCallback() {
    const dataCode = this.getAttribute("data-code");
    const language = this.getAttribute("language") || "javascript";
    const copied = signal(false);

    const { fragment, dispose } = html`
      <div class="code-wrapper">
        <pre><code class="language-${language}" data-code="${dataCode}"></code></pre>
        <button
          class=${computed(() =>
            copied.value ? "copy-btn copied" : "copy-btn",
          )}
          @click=${async () => {
            const code = this.querySelector("code").textContent;
            await navigator.clipboard.writeText(code);
            copied.value = true;
            setTimeout(() => (copied.value = false), 2000);
          }}
        >
          ${computed(() => (copied.value ? "Copied!" : "Copy"))}
        </button>
      </div>
    `.render();

    this.appendChild(fragment);
    this._dispose = dispose;
  }

  disconnectedCallback() {
    this._dispose?.();
  }
}

customElements.define("code-block", CodeBlock);

// Install tabs component - reactive package manager switching
class InstallTabs extends HTMLElement {
  connectedCallback() {
    const selectedPkg = signal("npm");
    const installCommands = {
      npm: "npm install balises",
      yarn: "yarn add balises",
      pnpm: "pnpm add balises",
      bun: "bun add balises",
    };
    const installCmd = computed(() => installCommands[selectedPkg.value]);
    const copied = signal(false);

    const { fragment, dispose } = html`
      <div class="install-tabs">
        <button
          class="install-tab"
          data-active=${() => (selectedPkg.value === "npm" ? "true" : false)}
          @click=${() => (selectedPkg.value = "npm")}
        >
          npm
        </button>
        <button
          class="install-tab"
          data-active=${() => (selectedPkg.value === "yarn" ? "true" : false)}
          @click=${() => (selectedPkg.value = "yarn")}
        >
          yarn
        </button>
        <button
          class="install-tab"
          data-active=${() => (selectedPkg.value === "pnpm" ? "true" : false)}
          @click=${() => (selectedPkg.value = "pnpm")}
        >
          pnpm
        </button>
        <button
          class="install-tab"
          data-active=${() => (selectedPkg.value === "bun" ? "true" : false)}
          @click=${() => (selectedPkg.value = "bun")}
        >
          bun
        </button>
      </div>
      <div class="install-cmd">
        ${() =>
          html`<pre><code class="language-bash">${installCmd.value}</code></pre>`}
        <button
          class=${() => (copied.value ? "copy-btn copied" : "copy-btn")}
          @click=${async () => {
            await navigator.clipboard.writeText(installCmd.value);
            copied.value = true;
            setTimeout(() => (copied.value = false), 2000);
          }}
        >
          ${() => (copied.value ? "Copied!" : "Copy")}
        </button>
      </div>
    `.render();

    this.appendChild(fragment);
    this._dispose = dispose;

    // Highlight code after render and when command changes
    const highlight = () => {
      requestAnimationFrame(() => {
        const codeEl = this.querySelector("code");
        if (codeEl && window.Prism) {
          window.Prism.highlightElement(codeEl);
        }
      });
    };
    highlight();
    installCmd.subscribe(highlight);
  }

  disconnectedCallback() {
    this._dispose?.();
  }
}

customElements.define("install-tabs", InstallTabs);
