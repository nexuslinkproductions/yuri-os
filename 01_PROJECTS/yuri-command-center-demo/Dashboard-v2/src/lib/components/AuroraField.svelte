<div class="aurora" aria-hidden="true">
  <div class="aurora-blob a"></div>
  <div class="aurora-blob b"></div>
</div>

<style>
  .aurora {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .aurora-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    animation: aurora-drift 60s linear infinite;
    will-change: transform;
  }
  .aurora-blob.a {
    width: 900px; height: 900px;
    background: radial-gradient(circle, rgba(86,188,236,0.28), transparent 70%);
    top: -300px; left: -200px;
  }
  .aurora-blob.b {
    width: 700px; height: 700px;
    background: radial-gradient(circle, rgba(86,188,236,0.14), transparent 70%);
    bottom: -200px; right: -200px;
    animation-delay: -30s;
  }
  :global([data-theme="dark"]) .aurora-blob.a {
    background: radial-gradient(circle, rgba(86,188,236,0.18), transparent 70%);
  }
  :global([data-theme="dark"]) .aurora-blob.b {
    background: radial-gradient(circle, rgba(86,188,236,0.10), transparent 70%);
  }
  @keyframes aurora-drift {
    0%   { transform: translate(0, 0); }
    50%  { transform: translate(60px, 40px); }
    100% { transform: translate(0, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .aurora-blob { animation: none; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .aurora { display: none; }
  }
</style>
