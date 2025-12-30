/**
 * SearchBox Component - Search input with dropdown results
 */

import { html } from "../../../src/index.js";
import type { PokemonViewerState, SearchResult } from "../types.js";

export interface SearchBoxProps {
  state: PokemonViewerState;
  onInput: (e: Event) => void;
  onSelectResult: (result: SearchResult) => void;
}

/**
 * Renders a search box with dropdown results for finding Pokemon
 */
export function SearchBox(props: SearchBoxProps) {
  const { state, onInput, onSelectResult } = props;

  return html`
    <div class="search-section">
      <div class="search-box">
        <input
          type="search"
          placeholder="Search Pokemon..."
          @input=${onInput}
          @search=${onInput}
        />
        <div
          class="search-results"
          style=${() => (state.searchResults.length > 0 ? "" : "display: none")}
        >
          ${() =>
            state.searchResults
              .slice(0, 8)
              .map(
                (r) => html`
                  <div class="search-result" @click=${() => onSelectResult(r)}>
                    ${r.name}
                  </div>
                `,
              )}
        </div>
      </div>
    </div>
  `;
}

export type { SearchResult };
