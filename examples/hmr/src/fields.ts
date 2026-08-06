import { html, signal } from "balises";

const text = signal("");

export function TextField() {
  return html`
    <strong>input component</strong> — edit <code>src/fields.ts</code>
    <br />
    <input
      .value=${text}
      @input=${(e: Event) => (text.value = (e.target as HTMLInputElement).value)}
      placeholder="type here"
    />
    <p>you typed: <strong>${text}</strong></p>
  `;
}
