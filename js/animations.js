// Forkuslugi
// JS-анимации (CSS keyframes лежат в style.css)

import { sleep } from './utils.js';

export function playBtnPress(element) {
  if (!element) return;
  element.classList.remove('anim-btn-press');
  void element.offsetWidth;
  element.classList.add('anim-btn-press');
}

export function playShake(element) {
  if (!element) return;
  element.classList.remove('anim-shake');
  void element.offsetWidth;
  element.classList.add('anim-shake');
}

export function playPopIn(element) {
  if (!element) return;
  element.classList.remove('anim-pop-in');
  void element.offsetWidth;
  element.classList.add('anim-pop-in');
}

/**
 * Открывает bottom sheet с анимацией
 */
export function openSheet(overlayElement) {
  document.body.appendChild(overlayElement);
  requestAnimationFrame(() => overlayElement.classList.add('sheet-overlay--visible'));
}

/**
 * Закрывает bottom sheet с анимацией и удаляет из DOM
 */
export async function closeSheet(overlayElement) {
  overlayElement.classList.remove('sheet-overlay--visible');
  await sleep(280);
  overlayElement.remove();
}

/**
 * Показывает полноэкранное сообщение об успехе (например, после подачи заявки)
 */
export async function showSuccessOverlay({ icon = '✅', title, subtitle }) {
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-anim';
  overlay.innerHTML = `
    <div class="fullscreen-anim__content anim-pop-in">
      <div class="fullscreen-anim__icon">${icon}</div>
      <div class="fullscreen-anim__title">${title}</div>
      ${subtitle ? `<div class="fullscreen-anim__subtitle">${subtitle}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('fullscreen-anim--visible'));

  await sleep(1600);

  overlay.classList.remove('fullscreen-anim--visible');
  await sleep(300);
  overlay.remove();
}
