/**
 * Inline styles for the generated SSR page (embedded by build-html.ts).
 * Uses the shared example.css variables (dark theme).
 */

export const STYLES = `
.pokedex {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.pokedex-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.pokedex-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.pokedex-header .subtitle {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.fav-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-color: var(--border);
  background: var(--bg-subtle);
  color: var(--text);
}

.fav-toggle.active {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.15);
}

.fav-count {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.85rem;
}

/* ============ Controls ============ */

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.search {
  width: 100%;
  padding: 0.6rem 0.875rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
}

.search:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  padding: 0.3rem 0.75rem;
  font-size: 0.85rem;
  border-radius: 2rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
  text-transform: capitalize;
}

.chip:hover {
  border-color: var(--accent);
  color: var(--text);
}

.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

/* ============ Layout ============ */

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 1.5rem;
  align-items: start;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.875rem;
}

/* ============ Cards ============ */

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem;
  border: 2px solid var(--border);
  border-radius: 0.75rem;
  background: var(--bg-subtle);
  transition: all 0.15s ease;
  overflow: hidden;
}

.card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.card.selected {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
  box-shadow: 0 0 0 1px var(--accent);
}

.card-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  width: 100%;
  padding: 0.25rem;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
}

.card-main:hover {
  border: none;
  background: transparent;
}

.card-main img {
  width: 84px;
  height: 84px;
  object-fit: contain;
  image-rendering: pixelated;
}

.card-main .number {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: "JetBrains Mono", monospace;
}

.card-main h3 {
  margin: 0.15rem 0;
  font-size: 0.95rem;
  text-transform: capitalize;
}

.types {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  justify-content: center;
}

.fav {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--bg);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.fav:hover {
  border-color: var(--accent);
  transform: scale(1.1);
}

.fav.active {
  color: #f59e0b;
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

/* ============ Type badges ============ */

.type-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 1rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: white;
  background: #777;
}

.type-badge.normal { background: #a8a878; }
.type-badge.fire { background: #f08030; }
.type-badge.water { background: #6890f0; }
.type-badge.electric { background: #f8d030; color: #1a1a1a; }
.type-badge.grass { background: #78c850; }
.type-badge.ice { background: #98d8d8; color: #1a1a1a; }
.type-badge.fighting { background: #c03028; }
.type-badge.poison { background: #a040a0; }
.type-badge.ground { background: #e0c068; color: #1a1a1a; }
.type-badge.flying { background: #a890f0; }
.type-badge.psychic { background: #f85888; }
.type-badge.bug { background: #a8b820; }
.type-badge.rock { background: #b8a038; }
.type-badge.ghost { background: #705898; }
.type-badge.dragon { background: #7038f8; }
.type-badge.dark { background: #705848; }
.type-badge.steel { background: #b8b8d0; color: #1a1a1a; }
.type-badge.fairy { background: #ee99ac; }

/* ============ Detail panel ============ */

.detail {
  position: sticky;
  top: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--bg-subtle);
}

.detail h3 {
  margin: 0.25rem 0 0;
  font-size: 1.25rem;
  text-transform: capitalize;
}

.detail .number {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-family: "JetBrains Mono", monospace;
  font-weight: 400;
}

.detail-sprite {
  width: 140px;
  height: 140px;
  object-fit: contain;
  image-rendering: pixelated;
}

.flavor {
  margin: 0.25rem 0;
  font-size: 0.9rem;
  color: var(--text-muted);
  text-align: center;
}

.stats {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.stat-row {
  display: grid;
  grid-template-columns: 56px 1fr 32px;
  align-items: center;
  gap: 0.5rem;
}

.stat-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.stat-bar {
  height: 8px;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
}

.stat-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.stat-fill.hp { background: #ef4444; }
.stat-fill.attack { background: #f97316; }
.stat-fill.defense { background: #eab308; }
.stat-fill.specialAttack { background: #3b82f6; }
.stat-fill.specialDefense { background: #22c55e; }
.stat-fill.speed { background: #ec4899; }

.stat-value {
  font-size: 0.8rem;
  font-weight: 600;
  text-align: right;
  font-family: "JetBrains Mono", monospace;
}

.detail-slot {
  min-height: 200px;
}

.grid-loading,
.detail-loading,
.no-results {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.95rem;
}

.grid-loading {
  grid-column: 1 / -1;
  border: 1px dashed var(--border);
  border-radius: 0.75rem;
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--text-muted);
  text-align: center;
}

.detail-empty-icon {
  font-size: 2rem;
}

.detail-empty p {
  margin: 0;
  font-size: 0.95rem;
}

.detail-fav {
  margin-top: 0.5rem;
  width: 100%;
}

.detail-fav.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

/* ============ Footer note ============ */

.ssr-note {
  margin-top: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.85rem;
}

@media (max-width: 760px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .detail {
    position: static;
  }
}
`;
