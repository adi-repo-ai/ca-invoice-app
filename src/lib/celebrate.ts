// Small, dependency-free celebrations: confetti for a paid invoice and a
// check-mark pop when an invoice is issued. Respects "reduce motion".
const COLORS = ['#0c629b', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function confetti(count = 90): void {
  if (reducedMotion()) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    const size = 6 + Math.random() * 6;
    const left = Math.random() * 100;
    const drift = (Math.random() - 0.5) * 240;
    const dur = 1400 + Math.random() * 1200;
    p.style.cssText = `position:absolute;top:-12px;left:${left}vw;width:${size}px;height:${size * 0.45}px;background:${COLORS[i % COLORS.length]};border-radius:2px;opacity:.95`;
    layer.appendChild(p);
    p.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${drift}px, 105vh) rotate(${720 + Math.random() * 360}deg)`, opacity: 0.9 },
      ],
      { duration: dur, delay: Math.random() * 250, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' },
    );
  }
  setTimeout(() => layer.remove(), 3200);
}

export function checkPop(): void {
  if (reducedMotion()) return;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<svg width="88" height="88" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#16a34a"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el.style.cssText = 'position:fixed;left:50%;top:40%;z-index:9999;pointer-events:none;transform:translate(-50%,-50%)';
  document.body.appendChild(el);
  el.animate(
    [
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
    ],
    { duration: 1300, easing: 'ease-out', fill: 'forwards' },
  );
  setTimeout(() => el.remove(), 1400);
}
