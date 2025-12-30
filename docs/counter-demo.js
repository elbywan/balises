import { html, signal, computed } from "./examples/balises.esm.js";

class MyCounter extends HTMLElement {
  #count = signal(0);
  #dispose;

  connectedCallback() {
    const double = computed(() => this.#count.value * 2);

    const { fragment, dispose } = html`
      <p>Count: ${this.#count} (doubled: ${double})</p>
      <button @click=${() => this.#count.value++}>+1</button>
      <button @click=${() => (this.#count.value = 0)}>Reset</button>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  disconnectedCallback() {
    this.#dispose?.();
  }
}

customElements.define("my-counter", MyCounter);
