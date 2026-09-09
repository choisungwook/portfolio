<script lang="ts">
  import type { Kind } from "../lib/api";
  import { presets, type Preset } from "../lib/dates";

  let {
    kind = $bindable(),
    preset = $bindable(),
    start = $bindable(),
    end = $bindable(),
    topN = $bindable(),
    settleDays,
    onSettleDays,
  }: {
    kind: Kind;
    preset: Preset;
    start: string;
    end: string;
    topN: number;
    settleDays: number;
    onSettleDays: (days: number) => void;
  } = $props();

  const kinds: { id: Kind; label: string }[] = [
    { id: "site", label: "Site" },
    { id: "page", label: "Page" },
    { id: "channel", label: "URL channel" },
  ];

  let settle = $state(7);
  $effect(() => {
    settle = settleDays;
  });
</script>

<aside class="sidebar">
  <h1>akbun-adsenseview</h1>

  <div class="group">
    <span class="title">Group by</span>
    <div class="choices">
      {#each kinds as item (item.id)}
        <button class:active={kind === item.id} onclick={() => (kind = item.id)}>{item.label}</button>
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="title">Period</span>
    <div class="choices">
      {#each presets as item (item.id)}
        <button class:active={preset === item.id} onclick={() => (preset = item.id)}>{item.label}</button>
      {/each}
    </div>
    {#if preset === "custom"}
      <div class="row">
        <input type="date" bind:value={start} max={end} />
        <input type="date" bind:value={end} min={start} />
      </div>
    {/if}
  </div>

  <div class="group">
    <label for="topn">Top N</label>
    <select id="topn" bind:value={topN}>
      {#each [10, 20, 50, 100] as n (n)}
        <option value={n}>{n}</option>
      {/each}
    </select>
  </div>

  <div class="spacer"></div>

  <div class="group">
    <label for="settle">Settle days</label>
    <div class="row">
      <input id="settle" type="number" min="0" max="90" bind:value={settle} />
      <button onclick={() => onSettleDays(settle)} disabled={settle === settleDays}>Save</button>
    </div>
    <span class="muted">Days before today that are always refetched</span>
  </div>
</aside>
