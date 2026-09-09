<script lang="ts">
  import type { Named } from "../lib/aggregate";
  import { count, money } from "../lib/format";

  let {
    title,
    rows,
    currency,
    nameHeader = "Name",
  }: { title: string; rows: Named[]; currency: string | null; nameHeader?: string } = $props();
</script>

<div class="panel">
  <h2>{title}</h2>
  {#if rows.length === 0}
    <span class="muted">No rows in this period</span>
  {:else}
    <table>
      <thead>
        <tr>
          <th>{nameHeader}</th>
          <th>Earnings</th>
          <th>Page views</th>
          <th>RPM</th>
          <th>Clicks</th>
          <th>Impressions</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.name)}
          <tr>
            <td class="name">{row.name}</td>
            <td>{money(row.earnings, currency)}</td>
            <td>{count(row.pageViews)}</td>
            <td>{money(row.rpm, currency)}</td>
            <td>{count(row.clicks)}</td>
            <td>{count(row.impressions)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
