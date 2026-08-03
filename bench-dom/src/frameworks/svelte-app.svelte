<script>
  import { state } from "./svelte-state.svelte.js";

  function select(id) {
    state.selectedId = id;
  }
  function remove(id) {
    state.rows = state.rows.filter((row) => row.id !== id);
  }
</script>

<table class="table table-hover table-striped test-data">
  <tbody>
    {#each state.rows as row (row.id)}
      <tr class:danger={state.selectedId === row.id}>
        <td class="col-md-1">{row.id}</td>
        <td class="col-md-4">
          <a onclick={() => select(row.id)}>{row.label}</a>
        </td>
        <td class="col-md-1">
          <a onclick={() => remove(row.id)}>
            <span
              class="glyphicon glyphicon-remove"
              aria-hidden="true"
            ></span>
          </a>
        </td>
        <td class="col-md-6"></td>
      </tr>
    {/each}
  </tbody>
</table>
