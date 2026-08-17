/**
 * The ambient background driver (ADR-036): feeds scroll position and pointer
 * position into CSS custom properties that `styles.css` maps onto the
 * gradient orbs, so the background drifts as you move and scroll.
 *
 * Compositor-friendly on purpose: one rAF loop writes three variables and the
 * orbs move on `transform` only — no layout, no paint. Honors
 * `prefers-reduced-motion` by never starting.
 */
export function startAmbient() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  let mx = 0;
  let my = 0;
  let targetMx = 0;
  let targetMy = 0;
  let scroll = window.scrollY;
  let dirty = true;

  window.addEventListener(
    'pointermove',
    (e) => {
      targetMx = (e.clientX / window.innerWidth) * 2 - 1;
      targetMy = (e.clientY / window.innerHeight) * 2 - 1;
      dirty = true;
    },
    { passive: true },
  );
  window.addEventListener(
    'scroll',
    () => {
      scroll = window.scrollY;
      dirty = true;
    },
    { passive: true },
  );

  const tick = () => {
    // Ease toward the pointer so the orbs feel weighty, not jittery.
    mx += (targetMx - mx) * 0.06;
    my += (targetMy - my) * 0.06;
    if (dirty || Math.abs(targetMx - mx) > 0.001 || Math.abs(targetMy - my) > 0.001) {
      root.style.setProperty('--mx', mx.toFixed(4));
      root.style.setProperty('--my', my.toFixed(4));
      root.style.setProperty('--scroll', String(scroll));
      dirty = false;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
