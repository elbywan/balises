import { html } from "../../../src/index.js";
import type { Reactive } from "../../../src/signals/index.js";

/**
 * Reusable metric card component for displaying performance metrics
 */
export function MetricCard(props: {
  label: Reactive<string> | string;
  value: (() => unknown) | Reactive<unknown>;
  highlight?: Reactive<unknown> | unknown;
}) {
  return html`
    <div class="metric-card ${props.highlight ? "highlight" : ""}">
      <span class="metric-label">${props.label}</span>
      <span class="metric-value">${props.value}</span>
    </div>
  `;
}
