<script lang="ts">
  import { api, isAppError, type AppError, type DailyRow, type Kind, type Status } from "./lib/api";
  import { presetRange, type Preset } from "./lib/dates";
  import { byDay, bySiteOfPage, topN as pickTop, totals } from "./lib/aggregate";
  import Sidebar from "./components/Sidebar.svelte";
  import Summary from "./components/Summary.svelte";
  import DailyChart from "./components/DailyChart.svelte";
  import TopTable from "./components/TopTable.svelte";

  let status = $state<Status | null>(null);
  let kind = $state<Kind>("site");
  let preset = $state<Preset>("30d");
  let custom = $state(presetRange("custom"));
  let topN = $state(20);

  let rows = $state<DailyRow[]>([]);
  let apiDays = $state(0);
  let cacheDays = $state(0);
  let currency = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<AppError | null>(null);
  let loadedRange = $state({ start: "", end: "" });

  let range = $derived(preset === "custom" ? custom : presetRange(preset));
  let sum = $derived(totals(rows));
  let daily = $derived(byDay(rows, loadedRange.start, loadedRange.end));
  let top = $derived(pickTop(rows, topN));
  let sites = $derived(kind === "page" ? bySiteOfPage(rows) : []);

  const kindLabel: Record<Kind, string> = { site: "Site", page: "Page", channel: "URL channel" };

  function fail(e: unknown) {
    error = isAppError(e) ? e : { kind: "other", message: String(e) };
  }

  async function refresh() {
    status = await api.getStatus();
  }

  async function load() {
    if (!status?.signedIn || !range.start || !range.end || range.start > range.end) return;
    loading = true;
    error = null;
    try {
      const result = await api.loadReport(kind, range.start, range.end);
      rows = result.rows;
      apiDays = result.apiDays;
      cacheDays = result.cacheDays;
      currency = result.currency;
      loadedRange = { ...range };
    } catch (e) {
      fail(e);
    } finally {
      loading = false;
    }
  }

  async function signIn() {
    loading = true;
    error = null;
    try {
      status = await api.signIn();
    } catch (e) {
      fail(e);
    } finally {
      loading = false;
    }
  }

  async function signOut() {
    status = await api.signOut();
    rows = [];
  }

  async function clearCache() {
    try {
      await api.clearCache();
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function saveSettleDays(days: number) {
    try {
      status = await api.saveSettleDays(days);
      await load();
    } catch (e) {
      fail(e);
    }
  }

  $effect(() => {
    refresh();
  });

  $effect(() => {
    void kind;
    void range.start;
    void range.end;
    if (status?.signedIn) load();
  });
</script>

<Sidebar
  bind:kind
  bind:preset
  bind:start={custom.start}
  bind:end={custom.end}
  bind:topN
  settleDays={status?.settleDays ?? 7}
  onSettleDays={saveSettleDays}
/>

<main>
  <div class="toolbar">
    <strong>{kindLabel[kind]}</strong>
    <span class="muted">{range.start} to {range.end}</span>
    {#if loading}
      <span class="muted">Loading…</span>
    {:else if status?.signedIn}
      <span class="muted">API {apiDays} days / cache {cacheDays} days</span>
    {/if}
    <span class="spacer"></span>
    {#if status?.signedIn}
      <button onclick={load} disabled={loading}>Reload</button>
      <button class="danger" onclick={clearCache} disabled={loading}>Clear cache</button>
      <button onclick={signOut} disabled={loading}>Sign out</button>
    {:else}
      <button class="primary" onclick={signIn} disabled={loading || !status?.hasClientSecret}>Sign in with Google</button>
    {/if}
    <button onclick={api.openConfigDir}>Config folder</button>
  </div>

  {#if status && !status.hasClientSecret}
    <div class="notice error">
      Put client_secret.json from Google Cloud in <code>{status.configDir}</code>, then sign in.
    </div>
  {/if}

  {#if error}
    <div class="notice error">
      {#if error.kind === "auth"}
        Sign-in expired or was refused. Sign in again.
      {:else if error.kind === "quota"}
        AdSense API quota exhausted. Wait a while; cached days still show.
      {:else if error.kind === "setup"}
        {error.message}
      {:else}
        {error.message}
      {/if}
    </div>
  {/if}

  {#if status?.signedIn}
    <Summary totals={sum} {currency} />
    <DailyChart points={daily} {currency} />
    {#if kind === "page"}
      <TopTable title="By site" rows={sites} {currency} nameHeader="Domain" />
    {/if}
    <TopTable title={`Top ${topN} by earnings`} rows={top} {currency} nameHeader={kindLabel[kind]} />
  {:else if status?.hasClientSecret}
    <div class="notice">Sign in to load your AdSense reports.</div>
  {/if}

  <span class="muted">v{status?.version ?? ""} · {status?.configDir ?? ""}</span>
</main>
