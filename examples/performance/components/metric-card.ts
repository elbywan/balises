import { html, type Signal, type Computed } from "../../../src/index.js";

/**
 * Reusable metric card component for displaying performance metrics
 */
export function MetricCard(props: {
  label: string;
  value: string | number | Signal<number> | Computed<string>;
  highlight?: boolean | Signal<boolean> | Computed<boolean>;
}) {
  return html`
    <div class="metric-card ${props.highlight ? "highlight" : ""}">
      <span class="metric-label">${props.label}</span>
      <span class="metric-value">${props.value}</span>
    </div>
  `;
}
