/**
 * SearchBox Component - Search input with dropdown results
 */

import { html } from "../../../src/index.js";
import type { PokedexState, SearchResult } from "../types.js";
import type { PokedexTranslations } from "../utils/pokedex-translations.js";

/** Maximum search results to display */
const MAX_SEARCH_RESULTS = 8;

export interface SearchBoxProps {
  state: PokedexState;
  onInput: (e: Event) => void;
  onSelectResult: (result: SearchResult) => void;
  getTranslations: () => PokedexTranslations;
}

/**
 * Renders a search box with dropdown results for finding Pokemon
 */
export function SearchBox(props: SearchBoxProps) {
  const { state, onInput, onSelectResult, getTranslations } = props;
  const t = () => getTranslations();

  return html`
    <div class="search-section">
      <div class="search-box">
        <input
          type="search"
          placeholder=${() => t().searchPlaceholder}
          @input=${onInput}
          @search=${onInput}
        />
        <div
          class="search-results"
          style=${() => (state.searchResults.length > 0 ? "" : "display: none")}
        >
          ${() =>
            state.searchResults
              .slice(0, MAX_SEARCH_RESULTS)
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
