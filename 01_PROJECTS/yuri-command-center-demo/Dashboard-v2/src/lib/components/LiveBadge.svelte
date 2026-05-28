<script lang="ts">
  interface Props {
    active?: boolean;
    label?: string;
  }
  let { active = true, label = "LIVE" }: Props = $props();
</script>

<span class="live {active ? 'on' : 'off'}">
  <span class="dot"></span>
  <span class="caption">{label}</span>
</span>

<style>
  .live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 6px;
    border-radius: 999px;
    border: 1px solid var(--b2);
    background: var(--s1);
    backdrop-filter: blur(8px);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--t4);
    animation: none;
  }
  .live.on .dot {
    background: var(--gr);
    box-shadow: 0 0 8px var(--gr);
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1;   transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(0.7); }
  }
</style>
