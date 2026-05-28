<script lang="ts">
  /**
   * TimeSliderControls — port of schedule/+page.svelte lines 493-595 (the
   * polished "PLAN TICKET" modal with start-time + duration sliders).
   * Reused by the calendar view's add-block / edit-block modal so we keep
   * one canonical slider treatment.
   *
   * Native HTML5 range inputs — no external lib (mirrors the schedule.svelte
   * decision).
   */
  interface Props {
    day: string;             // YYYY-MM-DD
    startHour: number;       // 6..20 in 0.5 increments
    duration: number;        // 0.5..8 in 0.5 increments
    /** Optional pre-resolved member colour for the preview chip */
    accentColor?: string;
    onChange: (next: { day: string; startHour: number; duration: number }) => void;
  }
  const { day, startHour, duration, accentColor = "var(--brand)", onChange }: Props = $props();

  function fmtHour(h: number): string {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }
  function fmtDuration(d: number): string {
    const h = Math.floor(d);
    const m = Math.round((d - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function setStart(v: number) { onChange({ day, startHour: v, duration }); }
  function setDur(v: number)   { onChange({ day, startHour, duration: v }); }
  function setDay(v: string)   { onChange({ day: v, startHour, duration }); }

  // Day-of-week pills — Mon..Sun derived from current week of `day`
  const weekDays = $derived.by(() => {
    const d = new Date(day);
    // Monday of this week (ISO week)
    const m = new Date(d);
    const dow = m.getDay() || 7;
    m.setDate(m.getDate() - (dow - 1));
    const out: { iso: string; label: string; isToday: boolean }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(m); dt.setDate(m.getDate() + i);
      const iso = dt.toISOString().slice(0, 10);
      out.push({
        iso,
        label: dt.toLocaleDateString("de-CH", { weekday: "short", day: "numeric" }),
        isToday: dt.getTime() === today.getTime(),
      });
    }
    return out;
  });

  const endHour = $derived(Math.min(20, startHour + duration));
</script>

<div class="tsc">
  <!-- Day pills -->
  <div class="tsc__row">
    <span class="tsc__label">Day</span>
    <div class="tsc__days">
      {#each weekDays as d}
        <button
          type="button"
          class="day-pill"
          class:day-pill--active={day === d.iso}
          class:day-pill--today={d.isToday}
          onclick={() => setDay(d.iso)}
        >
          {d.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Start time slider -->
  <div class="tsc__row">
    <span class="tsc__label">Start</span>
    <div class="tsc__slider-wrap">
      <input
        type="range" min="6" max="20" step="0.5"
        value={startHour}
        oninput={(e) => setStart(Number((e.currentTarget as HTMLInputElement).value))}
        class="slider"
        style={`--slider-accent: ${accentColor};`}
      />
      <div class="tsc__ticks">
        <span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>20</span>
      </div>
    </div>
    <span class="tsc__value">{fmtHour(startHour)}</span>
  </div>

  <!-- Duration slider -->
  <div class="tsc__row">
    <span class="tsc__label">Duration</span>
    <div class="tsc__slider-wrap">
      <input
        type="range" min="0.5" max="8" step="0.5"
        value={duration}
        oninput={(e) => setDur(Number((e.currentTarget as HTMLInputElement).value))}
        class="slider"
        style={`--slider-accent: ${accentColor};`}
      />
      <div class="tsc__ticks">
        <span>30m</span><span>1h</span><span>2h</span><span>4h</span><span>6h</span><span>8h</span>
      </div>
    </div>
    <span class="tsc__value">{fmtDuration(duration)}</span>
  </div>

  <!-- Live preview chip -->
  <div class="tsc__preview" style={`--preview-accent: ${accentColor};`}>
    <span class="tsc__preview-bar" aria-hidden="true"></span>
    <span class="tsc__preview-label">
      {fmtHour(startHour)} → {fmtHour(endHour)}  ·  {fmtDuration(duration)}
    </span>
  </div>
</div>

<style>
  .tsc { display: flex; flex-direction: column; gap: 14px; }
  .tsc__row {
    display: grid;
    grid-template-columns: 80px 1fr auto;
    gap: 12px;
    align-items: center;
  }
  .tsc__label {
    font: 600 11px/1.2 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3);
  }
  .tsc__value {
    font: 700 14px/1 var(--mo);
    color: var(--tx);
    font-variant-numeric: tabular-nums;
    min-width: 64px; text-align: right;
  }

  /* Day pills */
  .tsc__days { display: flex; gap: 4px; flex-wrap: wrap; }
  .day-pill {
    appearance: none;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--s1);
    color: var(--t2);
    font: 600 11.5px/1 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 120ms;
  }
  .day-pill:hover { background: var(--s2); color: var(--tx); border-color: var(--brand-line); }
  .day-pill--today {
    border-color: var(--brand-line-2);
    color: var(--brand-deep);
  }
  .day-pill--active {
    background: var(--brand-soft);
    color: var(--brand-deep);
    border-color: var(--brand);
  }

  /* Sliders — port of schedule.svelte:1210-1236 with --slider-accent var */
  .tsc__slider-wrap { display: flex; flex-direction: column; gap: 4px; }
  .slider {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    background: var(--line-2);
    border-radius: 999px;
    outline: none;
    cursor: pointer;
  }
  .slider::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: var(--slider-accent, var(--brand));
    box-shadow: 0 0 0 3px rgba(86,188,236,0.20), 0 2px 6px rgba(11,16,32,0.18);
    cursor: pointer;
    transition: box-shadow 140ms;
  }
  .slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 5px rgba(86,188,236,0.28), 0 2px 8px rgba(11,16,32,0.22);
  }
  .slider::-moz-range-thumb {
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 0;
    background: var(--slider-accent, var(--brand));
    box-shadow: 0 0 0 3px rgba(86,188,236,0.20);
    cursor: pointer;
  }
  .tsc__ticks {
    display: flex; justify-content: space-between;
    font: 500 10px/1 var(--mo);
    color: var(--t3);
    margin-top: 2px;
  }

  /* Live preview chip */
  .tsc__preview {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--brand-softer);
    border: 1px solid var(--brand-line);
  }
  .tsc__preview-bar {
    width: 4px; height: 22px;
    border-radius: 2px;
    background: var(--preview-accent, var(--brand));
  }
  .tsc__preview-label {
    font: 600 13px/1 var(--mo);
    color: var(--tx);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 640px) {
    .tsc__row { grid-template-columns: 1fr; }
    .tsc__label { font-size: 10.5px; }
    .tsc__value { text-align: left; }
  }
</style>
