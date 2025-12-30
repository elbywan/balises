// Simple vanilla web components for static HTML templating
// These don't need reactivity, just DRY HTML structure

// Feature item with checkmark icon
class FeatureItem extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute("title");
    const desc = this.getAttribute("desc");

    this.innerHTML = `
      <div class="feature">
        <div class="feature-icon">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div class="feature-text"><strong>${title}</strong> — ${desc}</div>
      </div>
    `;
  }
}

customElements.define("feature-item", FeatureItem);

// API item (just composition, no reactivity needed here)
class ApiItem extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute("title");
    const dataCode = this.getAttribute("data-code");
    const desc = this.getAttribute("desc");

    this.innerHTML = `
      <div class="api-item">
        <h3>${title}</h3>
        <code-block data-code="${dataCode}"></code-block>
        <p>${desc}</p>
      </div>
    `;
  }
}

customElements.define("api-item", ApiItem);

// Example card
class ExampleCard extends HTMLElement {
  connectedCallback() {
    const href = this.getAttribute("href");
    const name = this.getAttribute("name");
    const desc = this.getAttribute("desc");

    this.innerHTML = `
      <a href="${href}" class="example-card">
        <div>
          <div class="name">${name}</div>
          <div class="desc">${desc}</div>
        </div>
        <span class="arrow">&rarr;</span>
      </a>
    `;
  }
}

customElements.define("example-card", ExampleCard);
