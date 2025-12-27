import { html, Signal, computed } from "../../src/index.js";

/**
 * A timer web component showcasing reactive computed values and cleanup
 */
export class TimerElement extends HTMLElement {
  #ms = new Signal(0);
  #running = new Signal(false);
  #intervalId: ReturnType<typeof setInterval> | null = null;
  #dispose: (() => void) | null = null;

  connectedCallback() {
    const formatted = computed(() => {
      const total = this.#ms.value;
      const mins = Math.floor(total / 60000);
      const secs = Math.floor((total % 60000) / 1000);
      const ms = total % 1000;
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
    });

    const buttonText = computed(() =>
      this.#running.value ? "Pause" : "Start",
    );

    const toggle = () => {
      if (this.#running.value) {
        this.stop();
      } else {
        this.start();
      }
    };

    const reset = () => {
      this.stop();
      this.#ms.value = 0;
    };

    const { fragment, dispose } = html`
      <div class="timer">
        <h2>Timer Example</h2>
        <div class="display">${formatted}</div>
        <div class="buttons">
          <button @click=${toggle}>${buttonText}</button>
          <button @click=${reset}>Reset</button>
        </div>
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  start() {
    if (!this.#running.value) {
      this.#running.value = true;
      this.#intervalId = setInterval(() => {
        this.#ms.value += 10;
      }, 10);
    }
  }

  stop() {
    if (this.#running.value) {
      this.#running.value = false;
      if (this.#intervalId) {
        clearInterval(this.#intervalId);
        this.#intervalId = null;
      }
    }
  }

  disconnectedCallback() {
    this.stop();
    this.#dispose?.();
  }
}

customElements.define("x-timer", TimerElement);
