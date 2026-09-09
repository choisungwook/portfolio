<script lang="ts">
  import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from "chart.js";
  import { money } from "../lib/format";

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  let { points, currency }: { points: { day: string; earnings: number }[]; currency: string | null } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | undefined;

  $effect(() => {
    const labels = points.map((p) => p.day.slice(5));
    const data = points.map((p) => p.earnings);
    const bar = getComputedStyle(document.documentElement).getPropertyValue("--bar").trim();
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
    chart?.destroy();
    chart = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: bar, borderRadius: 3 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => points[items[0].dataIndex].day,
              label: (item) => money(item.parsed.y ?? 0, currency),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, ticks: { color: muted } },
        },
      },
    });
    return () => {
      chart?.destroy();
      chart = undefined;
    };
  });
</script>

<div class="panel">
  <h2>Daily earnings</h2>
  <div class="chart"><canvas bind:this={canvas}></canvas></div>
</div>
