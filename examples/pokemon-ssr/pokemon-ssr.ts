/**
 * Entry for the SSR'd pokemon example.
 *
 * The exact same app code as examples/pokemon (the custom element in
 * pokemon.ts): this bundle is loaded by the pre-rendered page, where the
 * element's connectedCallback detects the server markup and hydrates it
 * instead of rendering fresh.
 */

import "../pokemon/pokemon.js";
