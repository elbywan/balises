import { html, Signal, computed } from "../../src/index.js";

/**
 * A simple counter web component showcasing reactive state
 */
export class CounterElement extends HTMLElement {
  #count = new Signal(0);
  #dispose: (() => void) | null = null;

  connectedCallback() {
    const doubled = computed(() => this.#count.value * 2);

    const { fragment, dispose } = html`
      <div class="counter">
        <h2>Counter Example</h2>
        <p>Count: <strong>${this.#count}</strong></p>
        <p>Doubled: <strong>${doubled}</strong></p>
        <div class="buttons">
          <button @click=${() => this.#count.value--}>-</button>
          <button @click=${() => this.#count.value++}>+</button>
          <button @click=${() => (this.#count.value = 0)}>Reset</button>
        </div>
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  disconnectedCallback() {
    this.#dispose?.();
  }
}

customElements.define("x-counter", CounterElement);
