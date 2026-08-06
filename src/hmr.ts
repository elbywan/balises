/**
 * Hot module replacement support (opt-in).
 *
 * `mount()` renders a template into a container and tracks the render in a
 * module-level registry. When a module is hot-reloaded it re-executes, so
 * calling `mount()` again with the same container re-binds the previous
 * render in place: slots whose values changed are updated without touching
 * the rest of the DOM, signal state is carried into new signal instances,
 * and nested templates are re-bound recursively. A changed template source
 * falls back to replacing the whole region.
 *
 * The module is bundler-agnostic: it never touches `import.meta.hot` — the
 * registry is driven purely by repeated `mount()` calls from re-executed
 * modules. With Vite the only glue needed in the app module is
 * `import.meta.hot?.accept()`.
 */

import { type RenderResult, type Template } from "./template.js";

interface Registration {
  template: Template;
  result: RenderResult;
  first: ChildNode | null;
  last: ChildNode | null;
}

/** Live renders, keyed by mount container (weak so dead containers GC). */
const registry = new WeakMap<Element | DocumentFragment, Registration>();

/**
 * Mount a template into a container.
 *
 * Appends the rendered fragment to the container and records the render in
 * the registry. Calling `mount()` again with the same container (e.g. after
 * a hot module reload) re-binds the previous render in place: slots whose
 * values changed are updated without touching the rest of the DOM, signal
 * state is carried into new signal instances, and nested templates are
 * re-bound recursively. A changed template source falls back to replacing
 * the whole region.
 *
 * @param container - The element or fragment to mount into.
 * @param template - The template to render (e.g. `html\`…\``).
 * @returns A dispose function that removes the rendered nodes from the
 *   container, disposes their subscriptions, and unregisters the render.
 *   Idempotent — safe to call twice.
 *
 * @example
 * import { mount } from "balises/hmr";
 * import { html } from "balises";
 *
 * const dispose = mount(document.querySelector("#app")!, html`…`);
 * // Vite: opt in to hot updates instead of a full page reload
 * import.meta.hot?.accept();
 * // Optionally clean up module-scope effects on update:
 * import.meta.hot?.dispose(() => { … });
 */
export function mount(
  container: Element | DocumentFragment,
  template: Template,
): () => void {
  const prev = registry.get(container);

  // Same template source and the previous region is still in the DOM:
  // re-bind slots in place, preserving DOM and state. (A cleared container
  // falls through to the replace path, which re-renders from scratch.)
  if (
    prev &&
    prev.first !== null &&
    container.contains(prev.first) &&
    template.rebind(prev.template, prev.result)
  ) {
    prev.template = template;
    return () => unmount(container);
  }

  const result = template.renderTracked();
  const reg: Registration = {
    template,
    result,
    first: result.fragment.firstChild as ChildNode | null,
    last: result.fragment.lastChild as ChildNode | null,
  };

  if (prev) {
    // Render the new fragment first, so a throwing render leaves the
    // previous render untouched.
    const first = prev.first,
      last = prev.last;
    if (first !== null && container.contains(first)) {
      // Insert new nodes before the old region, then remove the old range.
      container.insertBefore(result.fragment, first);
      removeRange(first, last);
    } else {
      // Old region is gone (container was cleared) — just append.
      container.appendChild(result.fragment);
    }
    prev.result.dispose();
  } else {
    container.appendChild(result.fragment);
  }

  registry.set(container, reg);
  return () => unmount(container);
}

/** Remove a registered render: nodes, subscriptions, and registration. */
function unmount(container: Element | DocumentFragment): void {
  const reg = registry.get(container);
  if (!reg) return;
  registry.delete(container);
  const { first, last, result } = reg;
  if (first !== null && container.contains(first)) {
    removeRange(first, last);
  }
  result.dispose();
}

/** Remove a contiguous range of sibling nodes, from first to last inclusive. */
function removeRange(first: ChildNode, last: ChildNode | null): void {
  let node: ChildNode | null = first;
  while (node !== null) {
    const next: ChildNode | null = node.nextSibling;
    node.remove();
    if (node === last) break;
    node = next;
  }
}
