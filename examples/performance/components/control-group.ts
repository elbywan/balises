import { html } from "../../../src/index.js";

/**
 * Control group component for action buttons
 */
export function ControlGroup(props: { title: string; children: unknown }) {
  return html`
    <div class="control-group">
      <h3>${props.title}</h3>
      <div class="button-row">${props.children}</div>
    </div>
  `;
}
