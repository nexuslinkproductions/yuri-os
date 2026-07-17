// Janine Wälti — interactions

// current year in footer
document.getElementById('year').textContent = new Date().getFullYear();

// mobile nav toggle
const header = document.querySelector('.site-header');
const toggle = document.getElementById('navToggle');
toggle.addEventListener('click', () => {
  const open = header.classList.toggle('nav-open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Menü schliessen' : 'Menü öffnen');
});

// close mobile nav when a link is tapped
document.querySelectorAll('#main-nav a').forEach(a =>
  a.addEventListener('click', () => {
    header.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  })
);

// reveal-on-scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));
