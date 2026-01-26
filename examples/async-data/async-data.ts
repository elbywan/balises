/**
 * Async Data Example - Demonstrates async generator templates
 *
 * This example shows how to use async generators for:
 * - Loading states while fetching data
 * - Automatic cleanup and restart when dependencies change
 * - DOM preservation on restart (settled pattern)
 * - Progressive data loading (fetch user, then fetch posts)
 */

import { html as baseHtml, signal, store } from "../../src/index.js";
import asyncPlugin, { type RenderedContent } from "../../src/async.js";
import matchPlugin, { when } from "../../src/match.js";

const html = baseHtml.with(asyncPlugin, matchPlugin);

// Types for JSONPlaceholder API
interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string;
  website: string;
  company: {
    name: string;
  };
}

interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

// Simulate network delay for demo purposes
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cache for fetched data to avoid repeated network requests
const userCache = new Map<number, User>();
const postsCache = new Map<number, Post[]>();

// API functions with caching
async function fetchUser(id: number): Promise<User> {
  const cached = userCache.get(id);
  if (cached) {
    await delay(100); // Small delay even for cached to show updating state
    return cached;
  }

  await delay(800);
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/users/${id}`,
  );
  if (!response.ok) throw new Error("Failed to fetch user");
  const user: User = await response.json();
  userCache.set(id, user);
  return user;
}

async function fetchUserPosts(userId: number): Promise<Post[]> {
  const cached = postsCache.get(userId);
  if (cached) {
    await delay(50); // Small delay even for cached
    return cached;
  }

  await delay(600);
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts?userId=${userId}&_limit=3`,
  );
  if (!response.ok) throw new Error("Failed to fetch posts");
  const posts: Post[] = await response.json();
  postsCache.set(userId, posts);
  return posts;
}

/**
 * User Profile with DOM Preservation
 *
 * Uses the `settled` parameter to preserve DOM when userId changes:
 * - First load: shows loading skeleton, then renders user profile
 * - On restart: keeps existing DOM visible, shows "Updating..." badge,
 *   updates content via reactive bindings when data arrives
 */
function UserProfilePreserved({
  userId,
}: {
  userId: ReturnType<typeof signal<number>>;
}) {
  // Store for reactive updates - persists across generator restarts
  const state = store({
    user: null as User | null,
    posts: [] as Post[],
    updating: false,
  });

  async function* loadUser(settled?: RenderedContent) {
    const id = userId.value; // Track dependency - restarts generator when changed

    // On restart: show updating state, keep existing DOM
    if (settled) {
      state.updating = true;
      try {
        const user = await fetchUser(id);
        state.user = user;
        const posts = await fetchUserPosts(id);
        state.posts = posts;
      } finally {
        state.updating = false;
      }
      return settled; // Preserve existing DOM
    }

    // First load: show loading skeleton
    yield html`
      <div class="user-profile">
        <div class="loading-overlay">
          <div class="spinner"></div>
          <span>Loading user...</span>
        </div>
      </div>
    `;

    // Fetch initial data
    const user = await fetchUser(id);
    state.user = user;

    // Show user info with posts loading
    yield html`
      <div class="user-profile">
        <div class="user-header">
          <div class="avatar">${user.name[0]}</div>
          <div class="user-info">
            <h2>${() => state.user?.name ?? ""}</h2>
            <p class="username">@${() => state.user?.username ?? ""}</p>
          </div>
          ${() =>
            state.updating
              ? html`<span class="updating-badge">Updating...</span>`
              : null}
        </div>

        <div class="user-details">
          <div class="detail-item">
            <span class="label">Email</span>
            <span class="value"
              >${() => state.user?.email.toLowerCase() ?? ""}</span
            >
          </div>
          <div class="detail-item">
            <span class="label">Phone</span>
            <span class="value">${() => state.user?.phone ?? ""}</span>
          </div>
          <div class="detail-item">
            <span class="label">Website</span>
            <span class="value">${() => state.user?.website ?? ""}</span>
          </div>
          <div class="detail-item">
            <span class="label">Company</span>
            <span class="value">${() => state.user?.company?.name ?? ""}</span>
          </div>
        </div>

        <div class="posts-section">
          <h3>Recent Posts <span class="loading-inline"></span></h3>
          <div class="posts-list"></div>
        </div>
      </div>
    `;

    // Fetch posts
    const posts = await fetchUserPosts(id);
    state.posts = posts;

    // Final render with all data and reactive bindings for future updates
    return html`
      <div class="user-profile">
        <div class="user-header">
          <div class="avatar">${() => state.user?.name[0] ?? "?"}</div>
          <div class="user-info">
            <h2>${() => state.user?.name ?? ""}</h2>
            <p class="username">@${() => state.user?.username ?? ""}</p>
          </div>
          ${() =>
            state.updating
              ? html`<span class="updating-badge">Updating...</span>`
              : null}
        </div>

        <div class="user-details">
          <div class="detail-item">
            <span class="label">Email</span>
            <span class="value"
              >${() => state.user?.email.toLowerCase() ?? ""}</span
            >
          </div>
          <div class="detail-item">
            <span class="label">Phone</span>
            <span class="value">${() => state.user?.phone ?? ""}</span>
          </div>
          <div class="detail-item">
            <span class="label">Website</span>
            <span class="value">${() => state.user?.website ?? ""}</span>
          </div>
          <div class="detail-item">
            <span class="label">Company</span>
            <span class="value">${() => state.user?.company?.name ?? ""}</span>
          </div>
        </div>

        <div class="posts-section">
          <h3>
            Recent Posts
            ${() =>
              state.updating
                ? html`<span class="loading-inline"></span>`
                : null}
          </h3>
          <div class="posts-list">
            ${() =>
              state.posts.map(
                (post) => html`
                  <article class="post-item">
                    <h4>${post.title}</h4>
                    <p>${post.body.slice(0, 80)}...</p>
                  </article>
                `,
              )}
          </div>
        </div>
      </div>
    `;
  }

  return html`${loadUser}`;
}

/**
 * User Profile with Progressive Loading
 *
 * Traditional approach: yields new content on each state change.
 * Shows loading → user → user+posts progression.
 * Entire DOM is replaced on each user switch.
 */
function UserProfileProgressive({
  userId,
}: {
  userId: ReturnType<typeof signal<number>>;
}) {
  return html`${async function* () {
    const id = userId.value;

    yield html`
      <div class="user-profile">
        <div class="loading-overlay">
          <div class="spinner"></div>
          <span>Loading user...</span>
        </div>
      </div>
    `;

    try {
      const user = await fetchUser(id);

      yield html`
        <div class="user-profile">
          <div class="user-header">
            <div class="avatar">${user.name[0]}</div>
            <div class="user-info">
              <h2>${user.name}</h2>
              <p class="username">@${user.username}</p>
            </div>
          </div>

          <div class="user-details">
            <div class="detail-item">
              <span class="label">Email</span>
              <span class="value">${user.email.toLowerCase()}</span>
            </div>
            <div class="detail-item">
              <span class="label">Phone</span>
              <span class="value">${user.phone}</span>
            </div>
            <div class="detail-item">
              <span class="label">Website</span>
              <span class="value">${user.website}</span>
            </div>
            <div class="detail-item">
              <span class="label">Company</span>
              <span class="value">${user.company.name}</span>
            </div>
          </div>

          <div class="posts-section">
            <h3>Recent Posts <span class="loading-inline"></span></h3>
            <div class="posts-list"></div>
          </div>
        </div>
      `;

      const posts = await fetchUserPosts(user.id);

      yield html`
        <div class="user-profile">
          <div class="user-header">
            <div class="avatar">${user.name[0]}</div>
            <div class="user-info">
              <h2>${user.name}</h2>
              <p class="username">@${user.username}</p>
            </div>
          </div>

          <div class="user-details">
            <div class="detail-item">
              <span class="label">Email</span>
              <span class="value">${user.email.toLowerCase()}</span>
            </div>
            <div class="detail-item">
              <span class="label">Phone</span>
              <span class="value">${user.phone}</span>
            </div>
            <div class="detail-item">
              <span class="label">Website</span>
              <span class="value">${user.website}</span>
            </div>
            <div class="detail-item">
              <span class="label">Company</span>
              <span class="value">${user.company.name}</span>
            </div>
          </div>

          <div class="posts-section">
            <h3>Recent Posts</h3>
            <div class="posts-list">
              ${posts.map(
                (post) => html`
                  <article class="post-item">
                    <h4>${post.title}</h4>
                    <p>${post.body.slice(0, 80)}...</p>
                  </article>
                `,
              )}
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      yield html`
        <div class="user-profile">
          <div class="error">
            <strong>Error</strong>
            <p>${message}</p>
          </div>
        </div>
      `;
    }
  }}`;
}

/**
 * Main App Component
 */
class AsyncDataElement extends HTMLElement {
  #userId = signal(1);
  #mode = signal<"preserved" | "progressive">("preserved");
  #dispose: (() => void) | null = null;

  connectedCallback() {
    const { fragment, dispose } = html`
      <div class="controls">
        <div class="mode-toggle">
          <button
            class=${() => (this.#mode.value === "preserved" ? "active" : "")}
            @click=${() => (this.#mode.value = "preserved")}
          >
            DOM Preserved
          </button>
          <button
            class=${() => (this.#mode.value === "progressive" ? "active" : "")}
            @click=${() => (this.#mode.value = "progressive")}
          >
            Progressive
          </button>
        </div>

        <div class="user-selector">
          ${[1, 2, 3, 4, 5].map(
            (id) => html`
              <button
                class=${() => (this.#userId.value === id ? "active" : "")}
                @click=${() => (this.#userId.value = id)}
              >
                ${id}
              </button>
            `,
          )}
        </div>
      </div>

      <div
        class="profile-container"
        style=${() => (this.#mode.value === "preserved" ? "" : "display:none")}
      >
        ${UserProfilePreserved({ userId: this.#userId })}
      </div>

      <div
        class="profile-container"
        style=${() =>
          this.#mode.value === "progressive" ? "" : "display:none"}
      >
        ${UserProfileProgressive({ userId: this.#userId })}
      </div>

      <div class="info-panel">
        ${when(
          () => this.#mode.value === "preserved",
          [
            () => html`
              <h4>DOM Preserved Mode</h4>
              <p>
                Uses the <code>settled</code> pattern. When switching users, the
                existing DOM is preserved and content updates via reactive
                bindings. Notice the "Updating..." badge and how the layout
                stays stable - no loading spinner replaces the content.
              </p>
            `,
            () => html`
              <h4>Progressive Mode</h4>
              <p>
                Traditional async generator approach. Each user switch yields
                new content at each step: loading → user info → posts. The
                entire DOM is replaced on each transition.
              </p>
            `,
          ],
        )}
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  disconnectedCallback() {
    this.#dispose?.();
  }
}

customElements.define("x-async-data", AsyncDataElement);
