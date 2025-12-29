import { html, Signal, computed, each } from "../../src/index.js";

interface Todo {
  id: number;
  text: string;
  completed: Signal<boolean>;
}

/**
 * A todo list web component showcasing efficient list rendering with each()
 */
export class TodoListElement extends HTMLElement {
  #todos = new Signal<Todo[]>([]);
  #nextId = 1;
  #filter = new Signal<"all" | "active" | "completed">("all");
  #dispose: (() => void) | null = null;

  connectedCallback() {
    const filteredTodos = computed(() => {
      const filter = this.#filter.value;
      const todos = this.#todos.value;
      if (filter === "active") return todos.filter((t) => !t.completed.value);
      if (filter === "completed") return todos.filter((t) => t.completed.value);
      return todos;
    });

    const remaining = computed(
      () => this.#todos.value.filter((t) => !t.completed.value).length,
    );

    const addTodo = (e: Event) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const input = form.elements.namedItem("todo") as HTMLInputElement;
      const text = input.value.trim();
      if (text) {
        this.#todos.update((todos) => [
          ...todos,
          { id: this.#nextId++, text, completed: new Signal(false) },
        ]);
        input.value = "";
      }
    };

    const removeTodo = (id: number) => {
      this.#todos.update((todos) => todos.filter((t) => t.id !== id));
    };

    const toggleTodo = (todo: Todo) => {
      todo.completed.value = !todo.completed.value;
      // Trigger reactivity for the filtered list
      this.#todos.update((todos) => [...todos]);
    };

    // renderTodo is called once per unique todo.id, template is cached and reused
    const renderTodo = (todo: Todo) => html`
      <li class=${computed(() => (todo.completed.value ? "completed" : ""))}>
        <input
          type="checkbox"
          .checked=${todo.completed}
          @change=${() => toggleTodo(todo)}
        />
        <span>${todo.text}</span>
        <button @click=${() => removeTodo(todo.id)}>x</button>
      </li>
    `;

    const { fragment, dispose } = html`
      <div class="todo-list">
        <h2>Todo List</h2>

        <form @submit=${addTodo}>
          <input type="text" name="todo" placeholder="What needs to be done?" />
          <button type="submit">Add</button>
        </form>

        <div class="filters">
          <button
            class=${computed(() =>
              this.#filter.value === "all" ? "active" : "",
            )}
            @click=${() => (this.#filter.value = "all")}
          >
            All
          </button>
          <button
            class=${computed(() =>
              this.#filter.value === "active" ? "active" : "",
            )}
            @click=${() => (this.#filter.value = "active")}
          >
            Active
          </button>
          <button
            class=${computed(() =>
              this.#filter.value === "completed" ? "active" : "",
            )}
            @click=${() => (this.#filter.value = "completed")}
          >
            Completed
          </button>
        </div>

        <ul>
          ${each(filteredTodos, (todo) => todo.id, renderTodo)}
        </ul>

        <p class="remaining">${remaining} items remaining</p>
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  disconnectedCallback() {
    this.#dispose?.();
  }
}

customElements.define("x-todo-list", TodoListElement);
