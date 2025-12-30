/**
 * SearchBox Component - Search input with dropdown results
 */

import { html, computed } from "../../../src/index.js";

export interface SearchResult {
  name: string;
  url: string;
}

export interface SearchBoxProps {
  searchQuery: string;
  searchResults: SearchResult[];
  onInput: (e: Event) => void;
  onSelectResult: (result: SearchResult) => void;
}

/**
 * Renders a search box with dropdown results for finding Pokemon
 */
export function SearchBox(props: SearchBoxProps) {
  const { searchResults, onInput, onSelectResult } = props;

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
          style=${computed(() =>
            searchResults.length > 0 ? "" : "display: none",
          )}
        >
          ${computed(() =>
            searchResults
              .slice(0, 8)
              .map(
                (r) => html`
                  <div class="search-result" @click=${() => onSelectResult(r)}>
                    ${r.name}
                  </div>
                `,
              ),
          )}
        </div>
      </div>
    </div>
  `;
}
