import { html, signal } from "balises";

const items = signal(["apple", "banana", "cherry", "durian"]);

export function List() {
  return html`
    <strong>list component</strong> — edit <code>src/list.ts</code>
    <ul>
      ${() => items.value.map((item) => html`<li>${item}</li>`)}
    </ul>
  `;
}
