const CURVES = [
  {
    name: "Original Thinking",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["baseline", "sevenfold", "breathing"],
    summary: "Baseline gallery entry: a rotating rose-like trail that anchors the whole collection.",
    note: "Mirror cue: this is the upstream project's starting point and the most direct reference for the rest of the gallery."
  },
  {
    name: "Thinking Five",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["fivefold", "cleaner loops"],
    summary: "A softer rose variant with a five-petal rhythm and tighter visual cadence.",
    note: "Mirror cue: preserve it as a comparison point for the denser seven- and ninefold versions."
  },
  {
    name: "Thinking Nine",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["ninefold", "dense", "braided"],
    summary: "A denser floral orbit with more inner turns compressed into the same motion field.",
    note: "Mirror cue: useful when you want to see how the gallery scales complexity without changing the overall language."
  },
  {
    name: "Rose Orbit",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["polar", "breathing"],
    summary: "Polar radius motion that expands and contracts around a stable circular path.",
    note: "Mirror cue: a compact explanation for the classic r = a cos(kθ) family."
  },
  {
    name: "Rose Curve",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["petals", "classic"],
    summary: "A classic rose curve used to turn repeated petals into a loading state.",
    note: "Mirror cue: keep this one close to the upstream source when comparing curve parameterization."
  },
  {
    name: "Rose Two",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["variant", "rotation"],
    summary: "A small change in the curve rhythm that keeps the same floral grammar but shifts the pacing.",
    note: "Mirror cue: useful as a compact variant when testing layout density."
  },
  {
    name: "Rose Three",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["variant", "motion"],
    summary: "Another rose-family variation with the same visual vocabulary and a different spin feel.",
    note: "Mirror cue: treat it as part of the same family cluster, not a separate design system."
  },
  {
    name: "Rose Four",
    family: "Rose / orbit",
    shape: "rose",
    tags: ["variant", "petal rhythm"],
    summary: "A fourth rose variant for quick side-by-side comparison of bloom rhythm and density.",
    note: "Mirror cue: the local page keeps the family grouping visible for easy inspection."
  },
  {
    name: "Lissajous Drift",
    family: "Lissajous / loop",
    shape: "lissajous",
    tags: ["orthogonal", "phase shift"],
    summary: "Cross-axis oscillation where the trace drifts like a measured interference pattern.",
    note: "Mirror cue: this is the cleanest entry for reading motion as phase relationships."
  },
  {
    name: "Lemniscate Bloom",
    family: "Loop / infinity",
    shape: "loop",
    tags: ["figure-eight", "symmetric"],
    summary: "A looping path that folds into an infinity-shaped bloom.",
    note: "Mirror cue: good reference for a compact two-lobed loader profile."
  },
  {
    name: "Hypotrochoid Loop",
    family: "Wheel / loop",
    shape: "loop",
    tags: ["epicyclic", "gear"],
    summary: "Nested rolling motion that reads like a gear path turned into a loader.",
    note: "Mirror cue: one of the more mechanical-looking entries in the gallery."
  },
  {
    name: "Three-Petal Spiral",
    family: "Spiral / petal",
    shape: "spiral",
    tags: ["threefold", "spiral"],
    summary: "A spiralized petal path with a triadic cadence and a softer inward pull.",
    note: "Mirror cue: good for differentiating spiral-family motion from pure rose curves."
  },
  {
    name: "Four-Petal Spiral",
    family: "Spiral / petal",
    shape: "spiral",
    tags: ["fourfold", "spiral"],
    summary: "A four-petal progression that keeps the spiral reading while spacing the lobes evenly.",
    note: "Mirror cue: useful when you want a more angular version of the spiral family."
  },
  {
    name: "Five-Petal Spiral",
    family: "Spiral / petal",
    shape: "spiral",
    tags: ["fivefold", "spiral"],
    summary: "A five-petal spiral with a balanced, almost floral rhythm.",
    note: "Mirror cue: sits between the rose and spiral categories in the visual taxonomy."
  },
  {
    name: "Six-Petal Spiral",
    family: "Spiral / petal",
    shape: "spiral",
    tags: ["sixfold", "spiral"],
    summary: "A denser spiral variant with a more hexagonal pulse.",
    note: "Mirror cue: a good check for how the catalog handles higher-density families."
  },
  {
    name: "Butterfly Phase",
    family: "Butterfly / wave",
    shape: "fourier",
    tags: ["butterfly", "phase"],
    summary: "A butterfly-like interference form with a heavier, more expressive contour.",
    note: "Mirror cue: treat this as one of the more expressive waveform references."
  },
  {
    name: "Cardioid Glow",
    family: "Cardioid / heart",
    shape: "heart",
    tags: ["cardioid", "glow"],
    summary: "A cardioid contour with a warm glow and a distinctly rounded inner cusp.",
    note: "Mirror cue: helps anchor the heart-shaped branch of the gallery."
  },
  {
    name: "Cardioid Heart",
    family: "Cardioid / heart",
    shape: "heart",
    tags: ["heart", "curve"],
    summary: "A heart-forward cardioid variant designed to read instantly as a loading emblem.",
    note: "Mirror cue: the most literal heart-shaped reference in the set."
  },
  {
    name: "Heart Wave",
    family: "Cardioid / heart",
    shape: "heart",
    tags: ["wave", "heart"],
    summary: "A wave-leaning heart form that softens the cardioid into a more fluid silhouette.",
    note: "Mirror cue: useful when comparing smooth, emotional shapes against mechanical loops."
  },
  {
    name: "Spiral Search",
    family: "Search / spiral",
    shape: "spiral",
    tags: ["scan", "search"],
    summary: "A spiral motion that feels like searching outward and then folding back in.",
    note: "Mirror cue: good for operator-facing UI that needs a sense of active exploration."
  },
  {
    name: "Fourier Flow",
    family: "Fourier / wave",
    shape: "fourier",
    tags: ["harmonic", "wave"],
    summary: "A harmonic path built from layered frequencies and a more technical wave signature.",
    note: "Mirror cue: the most analytical-looking entry in the gallery, useful for motion-system references."
  }
];

const catalog = document.querySelector("#catalog");
const detailPreview = document.querySelector("#detail-preview");
const detailTitle = document.querySelector("#detail-title");
const detailFamily = document.querySelector("#detail-family");
const detailSummary = document.querySelector("#detail-summary");
const detailTags = document.querySelector("#detail-tags");
const detailNote = document.querySelector("#detail-note");

let activeIndex = 0;

function renderCatalog() {
  catalog.innerHTML = "";

  CURVES.forEach((curve, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "curve-card";
    button.dataset.index = String(index);
    button.innerHTML = `
      <div class="curve-family">${curve.family}</div>
      <div class="curve-title">${curve.name}</div>
      <div class="curve-summary">${curve.summary}</div>
    `;
    button.addEventListener("click", () => setActive(index));
    catalog.appendChild(button);
  });
}

function renderDetail(curve) {
  detailPreview.dataset.shape = curve.shape;
  detailTitle.textContent = curve.name;
  detailFamily.textContent = curve.family;
  detailSummary.textContent = curve.summary;
  detailNote.textContent = curve.note;
  detailTags.innerHTML = "";

  curve.tags.forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    detailTags.appendChild(chip);
  });
}

function setActive(index) {
  activeIndex = index;
  renderDetail(CURVES[index]);

  document.querySelectorAll(".curve-card").forEach((card, i) => {
    card.classList.toggle("is-active", i === index);
    card.setAttribute("aria-pressed", i === index ? "true" : "false");
  });
}

renderCatalog();
setActive(activeIndex);
