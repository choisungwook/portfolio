<script lang="ts">
  import type { Totals } from "../lib/aggregate";
  import { count, money } from "../lib/format";

  let { totals, currency }: { totals: Totals; currency: string | null } = $props();
</script>

<div class="cards">
  <div class="card">
    <div class="label">Earnings</div>
    <div class="value">{money(totals.earnings, currency)}</div>
  </div>
  <div class="card">
    <div class="label">Page views</div>
    <div class="value">{count(totals.pageViews)}</div>
  </div>
  <div class="card">
    <div class="label">Page RPM</div>
    <div class="value">{money(totals.rpm, currency)}</div>
  </div>
  <div class="card">
    <div class="label">Clicks</div>
    <div class="value">{count(totals.clicks)}</div>
  </div>
</div>
