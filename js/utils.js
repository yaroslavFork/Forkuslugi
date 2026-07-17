// Forkuslugi
// Утилиты общего назначения

/**
 * Форматирует число в стиле ru-RU: 12 345,67
 */
export function formatNumber(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

/**
 * Форматирует сумму с валютой DUM
 */
export function formatAmount(value) {
  return `${formatNumber(value)} DUM`;
}

/**
 * Форматирует дату в DD.MM.YYYY (ru-RU)
 */
export function formatDate(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Форматирует дату и время
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const datePart = formatDate(date);
  const timePart = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${datePart} ${timePart}`;
}

/**
 * Возвращает первую букву имени (для аватара), в верхнем регистре
 */
export function getInitial(name) {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase();
}

/**
 * Простая защита от XSS при вставке текста в innerHTML
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Debounce-обёртка
 */
export function debounce(fn, delay = 300) {
  let timerId = null;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Короткая пауза (используется в анимациях)
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Безопасный querySelector с проверкой на существование
 */
export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

/**
 * Проверяет, просрочен ли срок оплаты (для налогов)
 */
export function isOverdue(dueDate) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * Оборачивает промис тайм-аутом. Если promise не завершится за ms миллисекунд,
 * withTimeout отклонится с ошибкой errorMessage.
 * Нужно для запросов к Supabase: на некоторых мобильных сетях сам сервис
 * может не отвечать вообще, и без тайм-аута приложение зависнет на экране
 * загрузки навсегда, ничего не сообщив пользователю.
 */
export function withTimeout(promise, ms, errorMessage = 'Превышено время ожидания ответа сервера') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}
