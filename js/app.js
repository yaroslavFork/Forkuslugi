// Forkuslugi
// Главный оркестратор приложения: роутинг экранов, состояние, обработчики событий

import { CONFIG } from './config.js';
import { loadSupabaseSDK, getSupabaseClient } from './supabase.js';
import { login, getSession, clearSession, isAdmin, refreshCurrentUser, updateSessionUser } from './auth.js';
import { initRealtime, removeAllChannels } from './realtime.js';
import { showSuccess, showError } from './toast.js';
import { formatAmount, formatDate, formatDateTime, getInitial, qs, qsa, escapeHtml, isOverdue, withTimeout } from './utils.js';
import { playShake, playBtnPress, playPopIn, showSuccessOverlay } from './animations.js';
import * as Profile from './profile.js';
import * as Payments from './payments.js';
import * as Gov from './government.js';
import * as Admin from './admin.js';

/* ==================== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ==================== */

const State = {
  user: null,
  screen: 'splash', // splash | error | login | profile | payments | government | admin
  paymentsTab: 'taxes', // taxes | fines
  govTab: 'notifications', // notifications | news | votes | appeals
  adminTab: 'users' // users | professions | applications | properties | taxes | fines | news | votes | appeals
};

const root = () => document.getElementById('app-root');

/* ==================== ИКОНКИ (inline SVG, чтобы работал currentColor) ==================== */

const ICONS = {
  profile: `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="16" r="9" stroke="currentColor" stroke-width="3.2"/><path d="M7,41 C7,30 14.5,25 24,25 C33.5,25 41,30 41,41" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  payments: `<svg viewBox="0 0 48 48" fill="none"><rect x="5" y="12" width="38" height="26" rx="5" stroke="currentColor" stroke-width="3.2"/><line x1="5" y1="20" x2="43" y2="20" stroke="currentColor" stroke-width="3.2"/><line x1="11" y1="30" x2="21" y2="30" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  government: `<svg viewBox="0 0 48 48" fill="none"><path d="M6,20 L20,20 L34,10 L34,34 L20,24 L6,24 Z" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/><path d="M20,24 L22,36 C22,38 19,39 18,37 L15,24" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M38,15 C41,18 41,26 38,29" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`
};

/* ==================== ТОЧКА ВХОДА ==================== */

async function bootstrap() {
  renderSplash();

  try {
    await loadSupabaseSDK();
  } catch (e) {
    console.error('[Forkuslugi] Не удалось загрузить Supabase SDK ни с одного источника:', e);
    renderConnectionError(e.message);
    return;
  }

  await initApp();
}

async function initApp() {
  const session = getSession();

  if (session) {
    try {
      const freshUser = await withTimeout(
        refreshCurrentUser(),
        30000,
        'Сервер не отвечает'
      );
      if (freshUser) {
        State.user = freshUser;
        startRealtimeForUser();
        goToDefaultScreen();
        return;
      }
    } catch (e) {
      console.error('[Forkuslugi] Не удалось загрузить сессию при старте:', e);
      renderConnectionError(e.message);
      return;
    }
  }

  renderLogin();
}

function goToDefaultScreen() {
  if (isAdmin(State.user)) {
    State.screen = 'admin';
    renderAdmin();
  } else {
    State.screen = 'profile';
    renderCitizenScreen('profile');
  }
}

/* ==================== SPLASH ==================== */

function renderSplash() {
  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--2"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="splash">
      <img src="svg/logo.svg" alt="Forkuslugi" class="splash__logo anim-splash-pulse" />
      <div class="splash__spinner spinner"></div>
      <div class="splash__text">Подключение...</div>
    </div>
  `;
}

function renderConnectionError(detail) {
  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="connection-error">
      <div class="connection-error__icon">📡</div>
      <h2>Нет соединения</h2>
      <p>Не удалось подключиться к серверу Forkuslugi. Проверьте интернет-соединение и попробуйте снова.</p>
      ${detail ? `<p class="text-muted" style="font-size:12px;margin-top:8px;">Причина: ${escapeHtml(detail)}</p>` : ''}
      <button class="btn btn--primary" id="retry-btn" style="width:auto;padding:14px 28px;">Повторить попытку</button>
    </div>
  `;
  qs('#retry-btn').addEventListener('click', () => {
    playBtnPress(qs('#retry-btn'));
    bootstrap();
  });
}

/* ==================== ЛОГИН ==================== */

function renderLogin() {
  State.screen = 'login';
  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--2"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="login-screen anim-fade-in-up">
      <img src="svg/logo.svg" alt="Forkuslugi" class="login-screen__logo" />
      <h1 class="text-center">Forkuslugi</h1>
      <p class="text-center mt-8">Государственные услуги Форкляндии</p>

      <form id="login-form" class="mt-24">
        <div class="field">
          <label for="login-username">Логин</label>
          <input id="login-username" type="text" autocomplete="username" required />
        </div>
        <div class="field password-field">
          <label for="login-password">Пароль</label>
          <input id="login-password" type="password" autocomplete="current-password" required />
          <span class="password-toggle" id="pw-toggle">👁</span>
        </div>
        <button type="submit" class="btn btn--primary mt-16" id="login-submit">Войти</button>
      </form>
      <p class="text-center mt-16 text-muted" style="font-size:12px;">Используется тот же логин, что и в F-BANK</p>
    </div>
  `;

  const pwInput = qs('#login-password');
  const pwToggle = qs('#pw-toggle');
  let pwVisible = false;
  pwToggle.addEventListener('click', () => {
    pwVisible = !pwVisible;
    pwInput.type = pwVisible ? 'text' : 'password';
    pwToggle.textContent = pwVisible ? '🙈' : '👁';
  });

  const form = qs('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#login-submit');
    const username = qs('#login-username').value.trim();
    const password = qs('#login-password').value;

    submitBtn.disabled = true;
    try {
      const user = await withTimeout(login(username, password), 30000, 'Сервер не отвечает, попробуйте ещё раз');
      State.user = user;
      startRealtimeForUser();
      showSuccess(`Добро пожаловать, ${user.username}!`);
      goToDefaultScreen();
    } catch (err) {
      console.error('[Forkuslugi] Ошибка входа:', err);
      playShake(qs('.login-screen'));
      showError(err.message || 'Неверный логин или пароль');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ==================== НИЖНЯЯ НАВИГАЦИЯ ==================== */

const NAV_ITEMS = [
  { key: 'profile', icon: ICONS.profile, label: 'Профиль' },
  { key: 'payments', icon: ICONS.payments, label: 'Платежи' },
  { key: 'government', icon: ICONS.government, label: 'Государство' }
];

function renderBottomNav(active) {
  return `
    <nav class="bottom-nav">
      ${NAV_ITEMS.map(
        (item) => `
        <button class="nav-item ${item.key === active ? 'active' : ''}" data-nav="${item.key}">
          ${item.icon}
          <span>${item.label}</span>
        </button>
      `
      ).join('')}
    </nav>
  `;
}

function bindBottomNav() {
  qsa('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.nav === State.screen) return;
      playBtnPress(btn);
      renderCitizenScreen(btn.dataset.nav);
    });
  });
}

/* ==================== REALTIME ==================== */

function startRealtimeForUser() {
  initRealtime((table, payload) => {
    handleRealtimeChange(table, payload);
  });
}

function handleRealtimeChange(table, payload) {
  if (!State.user) return;

  // Изменение собственного профиля (баланс, работа, заморозка)
  if (table === 'users' && payload.new && payload.new.username === State.user.username) {
    State.user = { ...State.user, ...payload.new };
    updateSessionUser(payload.new);
  }

  const screenTables = {
    profile: ['users', 'job_applications', 'properties', 'property_transfers'],
    payments: ['taxes', 'fines', 'users'],
    government: ['news', 'notifications', 'votes', 'vote_records', 'appeals'],
    admin: [
      'users', 'professions', 'job_applications', 'properties', 'property_transfers',
      'taxes', 'fines', 'news', 'votes', 'vote_records', 'appeals'
    ]
  };

  const relevant = screenTables[State.screen];
  if (relevant && relevant.includes(table)) {
    if (State.screen === 'admin') refreshAdminContent(false);
    else fillCitizenScreenContent(State.screen, false);
  }
}

/* ==================== ЛОГАУТ ==================== */

function logout() {
  removeAllChannels();
  clearSession();
  State.user = null;
  State.screen = 'login';
  renderLogin();
}

/* ==================== ОРКЕСТРАТОР ЭКРАНОВ ГРАЖДАНИНА ==================== */

async function renderCitizenScreen(screenName) {
  State.screen = screenName;

  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="screen" id="screen-content"></div>
    ${renderBottomNav(screenName)}
  `;
  bindBottomNav();

  await fillCitizenScreenContent(screenName, true);
}

async function fillCitizenScreenContent(screenName, showSpinner) {
  const content = qs('#screen-content');
  if (!content) return;

  if (showSpinner) {
    content.innerHTML = `<div class="text-center mt-24 text-muted">Загрузка...</div>`;
  }

  try {
    if (screenName === 'profile') await fillProfileScreen(content);
    else if (screenName === 'payments') await fillPaymentsScreen(content);
    else if (screenName === 'government') await fillGovernmentScreen(content);
  } catch (e) {
    content.innerHTML = `<div class="text-center mt-24 text-danger">Ошибка загрузки данных</div>`;
    showError(e.message || 'Ошибка загрузки данных');
  }
}

/* ==================== ЭКРАН ПРОФИЛЯ ==================== */

const CATEGORY_LABELS = CONFIG.PROPERTY_CATEGORY_LABELS;

async function fillProfileScreen(content) {
  const user = State.user;
  const { profession } = await Profile.getProfileData(user.username);
  const properties = await Profile.getUserProperties(user.username);

  content.innerHTML = `
    <div class="profile-header anim-fade-in-up">
      <div class="avatar">${getInitial(user.username)}</div>
      <h2>${escapeHtml(user.username)}</h2>
      <div class="text-muted">${escapeHtml(user.user_id || '—')}</div>
      <div class="badge">ГРАЖДАНИН ФОРКЛЯНДИИ</div>
    </div>

    <div class="section">
      <div class="info-card glass">
        <div class="info-card__label">Город</div>
        <div class="info-card__value">${escapeHtml(user.city || '—')}</div>
      </div>
      <div class="info-card glass">
        <div class="info-card__label">Работа</div>
        <div class="info-card__value">${profession ? escapeHtml(profession.title) : 'Не трудоустроен'}</div>
      </div>
      ${
        profession
          ? `<div class="info-card glass">
               <div class="info-card__label">Зарплата</div>
               <div class="info-card__value text-accent">${formatAmount(user.salary || profession.salary)}</div>
             </div>`
          : ''
      }
    </div>

    <div class="section">
      ${
        profession
          ? `<button class="btn btn--danger" id="resign-btn">Уволиться</button>`
          : `<button class="btn btn--primary" id="find-job-btn">Найти работу</button>`
      }
    </div>

    <div class="section">
      <div class="flex-between">
        <div class="section-title" style="margin-bottom:0;">Моя недвижимость</div>
        <button class="btn btn--small btn--ghost" id="register-property-btn">Зарегистрировать</button>
      </div>
      <div class="mt-16">
        ${
          properties.length === 0
            ? `<p class="text-muted">Пока ничего не зарегистрировано</p>`
            : properties.map(renderPropertyCard).join('')
        }
      </div>
    </div>
  `;

  const findJobBtn = qs('#find-job-btn');
  if (findJobBtn) findJobBtn.addEventListener('click', () => openJobsSheet());

  const resignBtn = qs('#resign-btn');
  if (resignBtn) {
    resignBtn.addEventListener('click', async () => {
      resignBtn.disabled = true;
      try {
        await Profile.requestResignation(user.username, profession.id);
        showSuccess('Заявка на увольнение отправлена');
      } catch (err) {
        showError(err.message || 'Не удалось подать заявку');
      } finally {
        resignBtn.disabled = false;
      }
    });
  }

  qs('#register-property-btn').addEventListener('click', () => openRegisterPropertySheet());

  qsa('[data-transfer-property]').forEach((btn) => {
    btn.addEventListener('click', () => openTransferPropertySheet(btn.dataset.transferProperty));
  });
}

function renderPropertyCard(property) {
  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="flex-between">
        <div class="item-card__title">${escapeHtml(property.title)}</div>
        <span class="status-pill status-pill--${property.status}">${CONFIG.STATUS_LABELS[property.status]}</span>
      </div>
      <div class="item-card__desc">${escapeHtml(property.description || '')}</div>
      <div class="item-card__meta">${CATEGORY_LABELS[property.category]}${property.address ? ' · ' + escapeHtml(property.address) : ''}</div>
      ${
        property.status === 'approved'
          ? `<button class="btn btn--small btn--ghost mt-8" data-transfer-property="${property.id}">Передать другому гражданину</button>`
          : ''
      }
    </div>
  `;
}

/* ---------- Найти работу (bottom sheet) ---------- */

async function openJobsSheet() {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 class="text-center mb-8">Вакансии</h3>
      <div id="jobs-list" class="mt-16"><div class="text-center text-muted">Загрузка...</div></div>
      <button type="button" class="btn btn--ghost mt-16" id="jobs-cancel">Закрыть</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('sheet-overlay--visible'));
  qs('#jobs-cancel', overlay).addEventListener('click', () => closeOverlay(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(overlay); });

  try {
    const professions = await Profile.getAvailableProfessions();
    const list = qs('#jobs-list', overlay);
    if (professions.length === 0) {
      list.innerHTML = `<p class="text-muted text-center">Вакансий пока нет</p>`;
      return;
    }
    list.innerHTML = professions
      .map(
        (p) => `
      <div class="item-card glass">
        <div class="item-card__title">${escapeHtml(p.title)}</div>
        <div class="item-card__desc">${escapeHtml(p.description || '')}</div>
        <div class="item-card__footer">
          <div class="item-card__amount">${formatAmount(p.salary)}</div>
          <div class="item-card__meta">${p.max_employees > 0 ? `${p.employedCount}/${p.max_employees}` : `${p.employedCount}`}</div>
        </div>
        ${
          p.isFull
            ? `<button class="btn btn--small btn--ghost mt-8" disabled>Мест нет</button>`
            : `<button class="btn btn--small btn--primary mt-8" data-apply="${p.id}">Подать заявку</button>`
        }
      </div>
    `
      )
      .join('');

    qsa('[data-apply]', overlay).forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await Profile.applyForJob(State.user.username, btn.dataset.apply);
          showSuccess('Заявка отправлена');
          closeOverlay(overlay);
        } catch (err) {
          showError(err.message || 'Не удалось подать заявку');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    qs('#jobs-list', overlay).innerHTML = `<p class="text-danger text-center">${escapeHtml(err.message)}</p>`;
  }
}

/* ---------- Регистрация имущества (bottom sheet) ---------- */

function openRegisterPropertySheet() {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 class="text-center mb-8">Регистрация имущества</h3>
      <form id="register-property-form" class="mt-16">
        <div class="field">
          <label for="rp-category">Тип</label>
          <select id="rp-category" required>
            <option value="realty">Недвижимость</option>
            <option value="transport">Транспорт</option>
            <option value="business">Бизнес</option>
          </select>
        </div>
        <div class="field">
          <label for="rp-title">Название</label>
          <input id="rp-title" type="text" required />
        </div>
        <div class="field">
          <label for="rp-desc">Описание</label>
          <input id="rp-desc" type="text" />
        </div>
        <div class="field" id="rp-address-field">
          <label for="rp-address">Адрес</label>
          <input id="rp-address" type="text" />
        </div>
        <button type="submit" class="btn btn--primary" id="rp-submit">Отправить заявку</button>
        <button type="button" class="btn btn--ghost mt-8" id="rp-cancel">Отмена</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('sheet-overlay--visible'));

  const categorySelect = qs('#rp-category', overlay);
  const addressField = qs('#rp-address-field', overlay);
  const toggleAddress = () => {
    addressField.style.display = categorySelect.value === 'transport' ? 'none' : 'block';
  };
  categorySelect.addEventListener('change', toggleAddress);
  toggleAddress();

  qs('#rp-cancel', overlay).addEventListener('click', () => closeOverlay(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(overlay); });

  qs('#register-property-form', overlay).addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#rp-submit', overlay);
    submitBtn.disabled = true;
    try {
      await Profile.registerProperty({
        owner: State.user.username,
        category: categorySelect.value,
        title: qs('#rp-title', overlay).value.trim(),
        description: qs('#rp-desc', overlay).value.trim(),
        address: qs('#rp-address', overlay).value.trim()
      });
      showSuccess('Заявка на регистрацию отправлена');
      closeOverlay(overlay);
      fillCitizenScreenContent('profile', false);
    } catch (err) {
      showError(err.message || 'Не удалось отправить заявку');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Передача имущества (bottom sheet) ---------- */

function openTransferPropertySheet(propertyId) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 class="text-center mb-8">Передать имущество</h3>
      <form id="transfer-property-form" class="mt-16">
        <div class="field">
          <label for="tp-recipient">Логин получателя</label>
          <input id="tp-recipient" type="text" required />
        </div>
        <button type="submit" class="btn btn--primary" id="tp-submit">Отправить заявку</button>
        <button type="button" class="btn btn--ghost mt-8" id="tp-cancel">Отмена</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('sheet-overlay--visible'));

  qs('#tp-cancel', overlay).addEventListener('click', () => closeOverlay(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(overlay); });

  qs('#transfer-property-form', overlay).addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#tp-submit', overlay);
    submitBtn.disabled = true;
    try {
      await Profile.requestPropertyTransfer(propertyId, State.user.username, qs('#tp-recipient', overlay).value.trim());
      showSuccess('Заявка на передачу отправлена');
      closeOverlay(overlay);
    } catch (err) {
      showError(err.message || 'Не удалось отправить заявку');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Общий помощник закрытия sheet ---------- */

function closeOverlay(overlay) {
  overlay.classList.remove('sheet-overlay--visible');
  setTimeout(() => overlay.remove(), 280);
}

/* ==================== ЭКРАН ПЛАТЕЖЕЙ ==================== */

async function fillPaymentsScreen(content) {
  const user = State.user;

  content.innerHTML = `
    <h2 class="anim-fade-in-down">Платежи</h2>
    <div class="sub-tabs mt-16">
      <button class="sub-tab ${State.paymentsTab === 'taxes' ? 'active' : ''}" data-payments-tab="taxes">Налоги</button>
      <button class="sub-tab ${State.paymentsTab === 'fines' ? 'active' : ''}" data-payments-tab="fines">Штрафы</button>
    </div>
    <div id="payments-list"></div>
  `;

  qsa('[data-payments-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.paymentsTab === State.paymentsTab) return;
      playBtnPress(btn);
      State.paymentsTab = btn.dataset.paymentsTab;
      fillCitizenScreenContent('payments', true);
    });
  });

  const list = qs('#payments-list');

  if (State.paymentsTab === 'taxes') {
    const taxes = await Payments.getUserTaxes(user.username);
    list.innerHTML =
      taxes.length === 0
        ? `<p class="text-muted text-center mt-24">Начислений нет</p>`
        : taxes.map(renderTaxCard).join('');
  } else {
    const fines = await Payments.getUserFines(user.username);
    list.innerHTML =
      fines.length === 0
        ? `<p class="text-muted text-center mt-24">Штрафов нет</p>`
        : fines.map(renderFineCard).join('');
  }

  qsa('[data-pay-tax]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const newBalance = await Payments.payTax(btn.dataset.payTax, user.username);
        State.user = { ...State.user, balance: newBalance };
        updateSessionUser({ balance: newBalance });
        showSuccess('Налог оплачен');
        fillCitizenScreenContent('payments', false);
      } catch (err) {
        showError(err.message || 'Не удалось оплатить');
        btn.disabled = false;
      }
    });
  });

  qsa('[data-pay-fine]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const newBalance = await Payments.payFine(btn.dataset.payFine, user.username);
        State.user = { ...State.user, balance: newBalance };
        updateSessionUser({ balance: newBalance });
        showSuccess('Штраф оплачен');
        fillCitizenScreenContent('payments', false);
      } catch (err) {
        showError(err.message || 'Не удалось оплатить');
        btn.disabled = false;
      }
    });
  });
}

function renderTaxCard(tax) {
  const overdue = !tax.paid && isOverdue(tax.due_date);
  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="flex-between">
        <div class="item-card__title">${escapeHtml(tax.title)}</div>
        <span class="status-pill status-pill--${tax.paid ? 'paid' : 'unpaid'}">${tax.paid ? 'Оплачено' : 'Не оплачено'}</span>
      </div>
      <div class="item-card__desc">${escapeHtml(tax.description || '')}</div>
      <div class="item-card__footer">
        <div class="item-card__amount">${formatAmount(tax.amount)}</div>
        <div class="item-card__meta ${overdue ? 'text-danger' : ''}">${tax.due_date ? 'до ' + formatDate(tax.due_date) : ''}</div>
      </div>
      ${!tax.paid ? `<button class="btn btn--primary btn--small mt-8" data-pay-tax="${tax.id}">Оплатить</button>` : ''}
    </div>
  `;
}

function renderFineCard(fine) {
  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="flex-between">
        <div class="item-card__title">${escapeHtml(fine.title)}</div>
        <span class="status-pill status-pill--${fine.paid ? 'paid' : 'unpaid'}">${fine.paid ? 'Оплачено' : 'Не оплачено'}</span>
      </div>
      <div class="item-card__desc">${escapeHtml(fine.description || '')}</div>
      <div class="item-card__footer">
        <div class="item-card__amount">${formatAmount(fine.amount)}</div>
      </div>
      ${!fine.paid ? `<button class="btn btn--primary btn--small mt-8" data-pay-fine="${fine.id}">Оплатить</button>` : ''}
    </div>
  `;
}

/* ==================== ЭКРАН ГОСУДАРСТВА ==================== */

const GOV_TABS = [
  { key: 'notifications', label: 'Уведомления' },
  { key: 'news', label: 'Новости' },
  { key: 'votes', label: 'Голосования' },
  { key: 'appeals', label: 'Обращения' }
];

async function fillGovernmentScreen(content) {
  content.innerHTML = `
    <h2 class="anim-fade-in-down">Государство</h2>
    <div class="admin-tabs mt-16" id="gov-tabs">
      ${GOV_TABS.map((t) => `<button class="admin-tab ${t.key === State.govTab ? 'active' : ''}" data-gov-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="gov-content"></div>
  `;

  qsa('[data-gov-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.govTab === State.govTab) return;
      playBtnPress(btn);
      State.govTab = btn.dataset.govTab;
      fillCitizenScreenContent('government', true);
    });
  });

  const govContent = qs('#gov-content');

  if (State.govTab === 'notifications') await fillNotificationsTab(govContent);
  else if (State.govTab === 'news') await fillNewsTab(govContent);
  else if (State.govTab === 'votes') await fillVotesTab(govContent);
  else if (State.govTab === 'appeals') await fillAppealsTab(govContent);
}

/* ---------- Уведомления ---------- */

async function fillNotificationsTab(container) {
  const notifications = await Gov.getUserNotifications(State.user.username);

  container.innerHTML =
    notifications.length === 0
      ? `<p class="text-muted text-center mt-24">Уведомлений нет</p>`
      : notifications
          .map(
            (n) => `
      <div class="item-card glass anim-fade-in-up" style="${n.read ? 'opacity:0.65;' : ''}">
        <div class="flex-between">
          <div class="item-card__title">${escapeHtml(n.title)}</div>
          ${!n.read ? `<span class="online-indicator"></span>` : ''}
        </div>
        <div class="item-card__desc">${escapeHtml(n.message || '')}</div>
        <div class="item-card__meta mt-8">${formatDateTime(n.created_at)}</div>
      </div>
    `
          )
          .join('');

  notifications.filter((n) => !n.read).forEach((n) => Gov.markNotificationRead(n.id));
}

/* ---------- Новости ---------- */

async function fillNewsTab(container) {
  const news = await Gov.getNews();

  container.innerHTML =
    news.length === 0
      ? `<p class="text-muted text-center mt-24">Новостей пока нет</p>`
      : news
          .map(
            (n) => `
      <div class="item-card glass anim-fade-in-up">
        <div class="item-card__title">${escapeHtml(n.title)}</div>
        <div class="item-card__desc">${escapeHtml(n.content)}</div>
        <div class="item-card__meta mt-8">${formatDateTime(n.created_at)}</div>
      </div>
    `
          )
          .join('');
}

/* ---------- Голосования ---------- */

async function fillVotesTab(container) {
  const votes = await Gov.getVotesForCitizen(State.user.username);

  container.innerHTML =
    votes.length === 0
      ? `<p class="text-muted text-center mt-24">Голосований пока нет</p>`
      : votes.map(renderVoteCard).join('');

  qsa('[data-vote-option]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const voteId = btn.dataset.voteId;
      const option = btn.dataset.voteOption;
      qsa(`[data-vote-id="${voteId}"]`).forEach((b) => (b.disabled = true));
      try {
        await Gov.castVote(voteId, State.user.username, option);
        showSuccess('Голос учтён');
        fillCitizenScreenContent('government', false);
      } catch (err) {
        showError(err.message || 'Не удалось проголосовать');
        qsa(`[data-vote-id="${voteId}"]`).forEach((b) => (b.disabled = false));
      }
    });
  });
}

function renderVoteCard(vote) {
  const options = [
    { value: vote.option1 },
    { value: vote.option2 },
    ...(vote.option3 ? [{ value: vote.option3 }] : [])
  ];

  let body;
  if (!vote.active) {
    body = `
      <div class="vote-winner mt-8">
        <div class="vote-winner__label">🏆 Победил</div>
        <div class="vote-winner__value">${escapeHtml(vote.winner_option || '—')}</div>
      </div>
    `;
  } else if (vote.hasVoted) {
    body = options
      .map(
        (o) => `
      <div class="vote-option ${o.value === vote.myChoice ? 'selected' : ''}">${escapeHtml(o.value)}${o.value === vote.myChoice ? ' ✓' : ''}</div>
    `
      )
      .join('');
  } else {
    body = options
      .map(
        (o) => `
      <button class="vote-option" data-vote-option="${escapeHtml(o.value)}" data-vote-id="${vote.id}">${escapeHtml(o.value)}</button>
    `
      )
      .join('');
  }

  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="item-card__title">${escapeHtml(vote.title)}</div>
      <div class="item-card__desc">${escapeHtml(vote.description || '')}</div>
      <div class="mt-16">${body}</div>
      ${
        vote.active
          ? `<div class="item-card__meta mt-8">Голосование активно · результаты скрыты до завершения</div>`
          : ''
      }
    </div>
  `;
}

/* ---------- Обращения ---------- */

async function fillAppealsTab(container) {
  const appeals = await Gov.getUserAppeals(State.user.username);

  container.innerHTML = `
    <div class="section glass" style="padding:16px;">
      <div class="section-title">Новое обращение</div>
      <form id="appeal-form">
        <div class="field">
          <textarea id="appeal-message" placeholder="Опишите вашу проблему или вопрос" required></textarea>
        </div>
        <button type="submit" class="btn btn--primary" id="appeal-submit">Отправить</button>
      </form>
    </div>
    <div class="section mt-24">
      <div class="section-title">Мои обращения</div>
      ${
        appeals.length === 0
          ? `<p class="text-muted">Обращений пока нет</p>`
          : appeals.map(renderAppealCard).join('')
      }
    </div>
  `;

  qs('#appeal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = qs('#appeal-submit');
    submitBtn.disabled = true;
    try {
      await Gov.createAppeal(State.user.username, qs('#appeal-message').value);
      showSuccess('Обращение отправлено');
      fillCitizenScreenContent('government', false);
    } catch (err) {
      showError(err.message || 'Не удалось отправить обращение');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function renderAppealCard(appeal) {
  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="flex-between">
        <div class="item-card__meta">${formatDateTime(appeal.created_at)}</div>
        <span class="status-pill status-pill--${appeal.status === 'closed' ? 'closed' : 'pending'}">${CONFIG.STATUS_LABELS[appeal.status]}</span>
      </div>
      <div class="item-card__desc mt-8">${escapeHtml(appeal.message)}</div>
      ${
        appeal.admin_reply
          ? `<div class="info-card glass mt-8" style="padding:10px 12px;">
               <div class="info-card__label">Ответ администрации</div>
               <div class="info-card__value" style="font-size:14px;font-weight:400;">${escapeHtml(appeal.admin_reply)}</div>
             </div>`
          : ''
      }
    </div>
  `;
}

/* ==================== АДМИН-ПАНЕЛЬ ==================== */

const ADMIN_TABS = [
  { key: 'users', label: 'Пользователи' },
  { key: 'professions', label: 'Профессии' },
  { key: 'applications', label: 'Заявки' },
  { key: 'realty', label: 'Недвижимость' },
  { key: 'transport', label: 'Транспорт' },
  { key: 'business', label: 'Бизнес' },
  { key: 'taxes', label: 'Налоги' },
  { key: 'fines', label: 'Штрафы' },
  { key: 'news', label: 'Новости' },
  { key: 'votes', label: 'Голосования' },
  { key: 'appeals', label: 'Обращения' }
];

async function renderAdmin() {
  State.screen = 'admin';

  root().innerHTML = `
    <div class="aurora-bg">
      <div class="aurora-layer aurora-layer--1"></div>
      <div class="aurora-layer aurora-layer--3"></div>
    </div>
    <div class="screen screen--no-nav">
      <div class="flex-between mt-8">
        <h2>Админ-панель</h2>
        <button class="btn btn--danger btn--small" id="admin-logout-btn">Выйти</button>
      </div>
      <div class="admin-tabs mt-16" id="admin-tabs"></div>
      <div id="admin-content"></div>
    </div>
  `;

  qs('#admin-logout-btn').addEventListener('click', () => logout());

  qs('#admin-tabs').innerHTML = ADMIN_TABS.map(
    (t) => `<button class="admin-tab ${t.key === State.adminTab ? 'active' : ''}" data-admin-tab="${t.key}">${t.label}</button>`
  ).join('');

  qsa('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.adminTab === State.adminTab) return;
      playBtnPress(btn);
      State.adminTab = btn.dataset.adminTab;
      renderAdmin();
    });
  });

  await refreshAdminContent(true);
}

async function refreshAdminContent(showSpinner = false) {
  const content = qs('#admin-content');
  if (!content) return;

  if (showSpinner) {
    content.innerHTML = `<div class="text-center mt-24 text-muted">Загрузка...</div>`;
  }

  try {
    if (State.adminTab === 'users') await fillAdminUsers(content);
    else if (State.adminTab === 'professions') await fillAdminProfessions(content);
    else if (State.adminTab === 'applications') await fillAdminApplications(content);
    else if (['realty', 'transport', 'business'].includes(State.adminTab)) await fillAdminProperties(content, State.adminTab);
    else if (State.adminTab === 'taxes') await fillAdminTaxes(content);
    else if (State.adminTab === 'fines') await fillAdminFines(content);
    else if (State.adminTab === 'news') await fillAdminNews(content);
    else if (State.adminTab === 'votes') await fillAdminVotes(content);
    else if (State.adminTab === 'appeals') await fillAdminAppeals(content);
  } catch (e) {
    content.innerHTML = `<div class="text-center mt-24 text-danger">Ошибка загрузки данных</div>`;
    showError(e.message || 'Ошибка загрузки данных');
  }
}

/* ---------- Пользователи ---------- */

async function fillAdminUsers(content) {
  const users = await Admin.listAllUsersWithProfessions();

  content.innerHTML =
    users.length === 0
      ? `<p class="text-muted text-center mt-24">Граждан пока нет</p>`
      : users
          .map(
            (u) => `
      <div class="admin-row glass anim-fade-in-up">
        <div>
          <div style="font-weight:700;">${escapeHtml(u.username)} ${u.frozen ? '<span class="chip chip--frozen">❄️</span>' : ''}</div>
          <div class="text-muted" style="font-size:12px;">${u.profession ? escapeHtml(u.profession.title) : 'Не трудоустроен'} · ${escapeHtml(u.city || '—')}</div>
        </div>
        <div class="text-accent" style="font-weight:700;">${formatAmount(u.balance)}</div>
      </div>
    `
          )
          .join('');
}

/* ---------- Профессии ---------- */

async function fillAdminProfessions(content) {
  const professions = await Admin.listProfessions();

  content.innerHTML = `
    <div class="section glass" style="padding:16px;">
      <div class="section-title">Новая профессия</div>
      <form id="prof-form">
        <div class="field"><label for="pf-title">Название</label><input id="pf-title" type="text" required /></div>
        <div class="field"><label for="pf-desc">Описание</label><input id="pf-desc" type="text" /></div>
        <div class="field"><label for="pf-salary">Зарплата (DUM)</label><input id="pf-salary" type="number" min="0" step="1" required /></div>
        <div class="field"><label for="pf-max">Максимум сотрудников (0 = без ограничений)</label><input id="pf-max" type="number" min="0" step="1" value="0" /></div>
        <button type="submit" class="btn btn--primary" id="pf-submit">Создать</button>
      </form>
    </div>
    <div class="section">
      <button class="btn btn--blue" id="pay-all-salaries-btn">💰 Выплатить зарплату всем профессиям</button>
    </div>
    <div class="section mt-8">
      ${professions.length === 0 ? `<p class="text-muted">Профессий пока нет</p>` : professions.map(renderAdminProfessionRow).join('')}
    </div>
  `;

  qs('#prof-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#pf-submit');
    btn.disabled = true;
    try {
      await Admin.createProfession({
        title: qs('#pf-title').value.trim(),
        description: qs('#pf-desc').value.trim(),
        salary: qs('#pf-salary').value,
        max_employees: qs('#pf-max').value
      });
      showSuccess('Профессия создана');
      refreshAdminContent();
    } catch (err) {
      showError(err.message || 'Не удалось создать профессию');
    } finally {
      btn.disabled = false;
    }
  });

  qs('#pay-all-salaries-btn').addEventListener('click', async () => {
    if (!confirm('Выплатить зарплату всем сотрудникам по всем профессиям?')) return;
    const btn = qs('#pay-all-salaries-btn');
    btn.disabled = true;
    try {
      const count = await Admin.paySalaryForAllProfessions();
      showSuccess(`Зарплата выплачена ${count} гражданам`);
      refreshAdminContent();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  qsa('[data-pay-salary]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Выплатить зарплату всем сотрудникам этой профессии?')) return;
      btn.disabled = true;
      try {
        const count = await Admin.paySalaryForProfession(btn.dataset.paySalary);
        showSuccess(`Зарплата выплачена ${count} сотрудникам`);
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-toggle-prof]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.setProfessionActive(btn.dataset.toggleProf, btn.dataset.nextState === 'true');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });

  qsa('[data-delete-prof]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить профессию? Все сотрудники будут уволены.')) return;
      btn.disabled = true;
      try {
        await Admin.deleteProfession(btn.dataset.deleteProf);
        showSuccess('Профессия удалена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderAdminProfessionRow(p) {
  const maxLabel = p.max_employees > 0 ? `${p.employedCount}/${p.max_employees}` : `${p.employedCount}`;
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;">${escapeHtml(p.title)}</div>
        <div class="text-muted" style="font-size:12px;">${formatAmount(p.salary)} · сотрудников: ${maxLabel}</div>
      </div>
      <div class="admin-row__actions">
        <span class="chip ${p.active ? 'chip--active' : ''}">${p.active ? 'Активна' : 'Выключена'}</span>
        <button class="btn btn--small btn--blue" data-pay-salary="${p.id}">💰</button>
        <button class="btn btn--small btn--ghost" data-toggle-prof="${p.id}" data-next-state="${!p.active}">${p.active ? 'Выкл' : 'Вкл'}</button>
        <button class="btn btn--small btn--danger" data-delete-prof="${p.id}">Удалить</button>
      </div>
    </div>
  `;
}

/* ---------- Заявки (трудоустройство / увольнение) ---------- */

async function fillAdminApplications(content) {
  const applications = await Admin.listJobApplications();
  const pending = applications.filter((a) => a.status === CONFIG.STATUS.PENDING);
  const resolved = applications.filter((a) => a.status !== CONFIG.STATUS.PENDING);

  content.innerHTML = `
    <div class="section">
      <div class="section-title">На рассмотрении</div>
      ${pending.length === 0 ? `<p class="text-muted">Нет новых заявок</p>` : pending.map(renderApplicationRow).join('')}
    </div>
    <div class="section mt-24">
      <div class="section-title">История</div>
      ${resolved.length === 0 ? `<p class="text-muted">Пусто</p>` : resolved.map(renderApplicationRow).join('')}
    </div>
  `;

  qsa('[data-approve-hire]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.approveHireApplication(btn.dataset.approveHire);
        showSuccess('Заявка одобрена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-reject-hire]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.rejectHireApplication(btn.dataset.rejectHire);
        showSuccess('Заявка отклонена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-approve-fire]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.approveResignation(btn.dataset.approveFire);
        showSuccess('Увольнение подтверждено');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-reject-fire]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.rejectResignation(btn.dataset.rejectFire);
        showSuccess('Заявка отклонена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderApplicationRow(app) {
  const isHire = app.type === 'hire';
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;">${escapeHtml(app.username)} · ${isHire ? 'трудоустройство' : 'увольнение'}</div>
        <div class="text-muted" style="font-size:12px;">${app.profession ? escapeHtml(app.profession.title) : '—'} · ${formatDateTime(app.created_at)}</div>
      </div>
      ${
        app.status === CONFIG.STATUS.PENDING
          ? `<div class="admin-row__actions">
               <button class="btn btn--small btn--primary" data-${isHire ? 'approve-hire' : 'approve-fire'}="${app.id}">✓</button>
               <button class="btn btn--small btn--danger" data-${isHire ? 'reject-hire' : 'reject-fire'}="${app.id}">✕</button>
             </div>`
          : `<span class="status-pill status-pill--${app.status}">${CONFIG.STATUS_LABELS[app.status]}</span>`
      }
    </div>
  `;
}

/* ---------- Имущество (недвижимость / транспорт / бизнес) ---------- */

async function fillAdminProperties(content, category) {
  const [allProperties, allTransfers] = await Promise.all([
    Admin.listProperties(),
    Admin.listPropertyTransfers()
  ]);

  const properties = allProperties.filter((p) => p.category === category);
  const transfers = allTransfers.filter((t) => t.property && t.property.category === category && t.status === CONFIG.STATUS.PENDING);
  const pending = properties.filter((p) => p.status === CONFIG.STATUS.PENDING);
  const resolved = properties.filter((p) => p.status !== CONFIG.STATUS.PENDING);

  content.innerHTML = `
    ${
      transfers.length > 0
        ? `<div class="section">
             <div class="section-title">Заявки на передачу</div>
             ${transfers.map(renderTransferRow).join('')}
           </div>`
        : ''
    }
    <div class="section">
      <div class="section-title">На рассмотрении</div>
      ${pending.length === 0 ? `<p class="text-muted">Нет новых заявок</p>` : pending.map((p) => renderAdminPropertyRow(p)).join('')}
    </div>
    <div class="section mt-24">
      <div class="section-title">Все записи</div>
      ${resolved.length === 0 ? `<p class="text-muted">Пусто</p>` : resolved.map((p) => renderAdminPropertyRow(p)).join('')}
    </div>
  `;

  qsa('[data-approve-property]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.approveProperty(btn.dataset.approveProperty);
        showSuccess('Регистрация подтверждена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-reject-property]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.rejectProperty(btn.dataset.rejectProperty);
        showSuccess('Регистрация отклонена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-approve-transfer]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.approvePropertyTransfer(btn.dataset.approveTransfer);
        showSuccess('Передача подтверждена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-reject-transfer]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Admin.rejectPropertyTransfer(btn.dataset.rejectTransfer);
        showSuccess('Передача отклонена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderAdminPropertyRow(p) {
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;">${escapeHtml(p.title)}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtml(p.owner_username)}${p.address ? ' · ' + escapeHtml(p.address) : ''}</div>
      </div>
      ${
        p.status === CONFIG.STATUS.PENDING
          ? `<div class="admin-row__actions">
               <button class="btn btn--small btn--primary" data-approve-property="${p.id}">✓</button>
               <button class="btn btn--small btn--danger" data-reject-property="${p.id}">✕</button>
             </div>`
          : `<span class="status-pill status-pill--${p.status}">${CONFIG.STATUS_LABELS[p.status]}</span>`
      }
    </div>
  `;
}

function renderTransferRow(t) {
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;">${t.property ? escapeHtml(t.property.title) : '—'}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtml(t.from_username)} → ${escapeHtml(t.to_username)}</div>
      </div>
      <div class="admin-row__actions">
        <button class="btn btn--small btn--primary" data-approve-transfer="${t.id}">✓</button>
        <button class="btn btn--small btn--danger" data-reject-transfer="${t.id}">✕</button>
      </div>
    </div>
  `;
}

/* ---------- Налоги ---------- */

async function fillAdminTaxes(content) {
  const taxes = await Admin.listTaxes();

  content.innerHTML = `
    <div class="section glass" style="padding:16px;">
      <div class="section-title">Новый налог</div>
      <div class="sub-tabs">
        <button type="button" class="sub-tab active" id="tax-target-one">Одному гражданину</button>
        <button type="button" class="sub-tab" id="tax-target-all">Всем гражданам</button>
      </div>
      <form id="tax-form">
        <div class="field"><label for="tx-title">Название</label><input id="tx-title" type="text" required /></div>
        <div class="field"><label for="tx-desc">Описание</label><input id="tx-desc" type="text" /></div>
        <div class="field"><label for="tx-amount">Сумма (DUM)</label><input id="tx-amount" type="number" min="0" step="1" required /></div>
        <div class="field" id="tx-recipient-field"><label for="tx-recipient">Логин получателя</label><input id="tx-recipient" type="text" /></div>
        <div class="field"><label for="tx-due">Срок оплаты</label><input id="tx-due" type="date" /></div>
        <button type="submit" class="btn btn--primary" id="tx-submit">Начислить</button>
      </form>
    </div>
    <div class="section mt-24">
      ${taxes.length === 0 ? `<p class="text-muted">Налогов пока нет</p>` : taxes.map(renderAdminTaxRow).join('')}
    </div>
  `;

  let taxTargetAll = false;
  const targetOneBtn = qs('#tax-target-one');
  const targetAllBtn = qs('#tax-target-all');
  const recipientField = qs('#tx-recipient-field');
  const recipientInput = qs('#tx-recipient');

  targetOneBtn.addEventListener('click', () => {
    taxTargetAll = false;
    targetOneBtn.classList.add('active');
    targetAllBtn.classList.remove('active');
    recipientField.style.display = 'block';
    recipientInput.required = true;
  });

  targetAllBtn.addEventListener('click', () => {
    taxTargetAll = true;
    targetAllBtn.classList.add('active');
    targetOneBtn.classList.remove('active');
    recipientField.style.display = 'none';
    recipientInput.required = false;
  });

  qs('#tax-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#tx-submit');
    btn.disabled = true;
    try {
      if (taxTargetAll) {
        if (!confirm('Начислить этот налог сразу всем гражданам?')) {
          btn.disabled = false;
          return;
        }
        const count = await Admin.createTaxForAll({
          title: qs('#tx-title').value.trim(),
          description: qs('#tx-desc').value.trim(),
          amount: qs('#tx-amount').value,
          due_date: qs('#tx-due').value
        });
        showSuccess(`Налог начислен ${count} гражданам`);
      } else {
        await Admin.createTax({
          title: qs('#tx-title').value.trim(),
          description: qs('#tx-desc').value.trim(),
          amount: qs('#tx-amount').value,
          recipient_username: qs('#tx-recipient').value.trim(),
          due_date: qs('#tx-due').value
        });
        showSuccess('Налог начислен');
      }
      refreshAdminContent();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  qsa('[data-delete-tax]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить начисление?')) return;
      btn.disabled = true;
      try {
        await Admin.deleteTax(btn.dataset.deleteTax);
        showSuccess('Удалено');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderAdminTaxRow(t) {
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;">${escapeHtml(t.title)}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtml(t.recipient_username)} · ${formatAmount(t.amount)}</div>
      </div>
      <div class="admin-row__actions">
        <span class="status-pill status-pill--${t.paid ? 'paid' : 'unpaid'}">${t.paid ? 'Оплачено' : 'Не оплачено'}</span>
        <button class="btn btn--small btn--danger" data-delete-tax="${t.id}">Удалить</button>
      </div>
    </div>
  `;
}

/* ---------- Штрафы ---------- */

async function fillAdminFines(content) {
  const fines = await Admin.listFines();

  content.innerHTML = `
    <div class="section glass" style="padding:16px;">
      <div class="section-title">Новый штраф</div>
      <div class="sub-tabs">
        <button type="button" class="sub-tab active" id="fine-target-one">Одному гражданину</button>
        <button type="button" class="sub-tab" id="fine-target-all">Всем гражданам</button>
      </div>
      <form id="fine-form">
        <div class="field"><label for="fn-title">Название</label><input id="fn-title" type="text" required /></div>
        <div class="field"><label for="fn-desc">Описание</label><input id="fn-desc" type="text" /></div>
        <div class="field"><label for="fn-amount">Сумма (DUM)</label><input id="fn-amount" type="number" min="0" step="1" required /></div>
        <div class="field" id="fn-recipient-field"><label for="fn-recipient">Логин получателя</label><input id="fn-recipient" type="text" /></div>
        <button type="submit" class="btn btn--primary" id="fn-submit">Начислить</button>
      </form>
    </div>
    <div class="section mt-24">
      ${fines.length === 0 ? `<p class="text-muted">Штрафов пока нет</p>` : fines.map(renderAdminFineRow).join('')}
    </div>
  `;

  let fineTargetAll = false;
  const fineTargetOneBtn = qs('#fine-target-one');
  const fineTargetAllBtn = qs('#fine-target-all');
  const fineRecipientField = qs('#fn-recipient-field');
  const fineRecipientInput = qs('#fn-recipient');

  fineTargetOneBtn.addEventListener('click', () => {
    fineTargetAll = false;
    fineTargetOneBtn.classList.add('active');
    fineTargetAllBtn.classList.remove('active');
    fineRecipientField.style.display = 'block';
    fineRecipientInput.required = true;
  });

  fineTargetAllBtn.addEventListener('click', () => {
    fineTargetAll = true;
    fineTargetAllBtn.classList.add('active');
    fineTargetOneBtn.classList.remove('active');
    fineRecipientField.style.display = 'none';
    fineRecipientInput.required = false;
  });

  qs('#fine-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#fn-submit');
    btn.disabled = true;
    try {
      if (fineTargetAll) {
        if (!confirm('Начислить этот штраф сразу всем гражданам?')) {
          btn.disabled = false;
          return;
        }
        const count = await Admin.createFineForAll({
          title: qs('#fn-title').value.trim(),
          description: qs('#fn-desc').value.trim(),
          amount: qs('#fn-amount').value
        });
        showSuccess(`Штраф начислен ${count} гражданам`);
      } else {
        await Admin.createFine({
          title: qs('#fn-title').value.trim(),
          description: qs('#fn-desc').value.trim(),
          amount: qs('#fn-amount').value,
          recipient_username: qs('#fn-recipient').value.trim()
        });
        showSuccess('Штраф начислен');
      }
      refreshAdminContent();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  qsa('[data-delete-fine]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить штраф?')) return;
      btn.disabled = true;
      try {
        await Admin.deleteFine(btn.dataset.deleteFine);
        showSuccess('Удалено');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderAdminFineRow(f) {
  return `
    <div class="admin-row glass anim-fade-in-up">
      <div>
        <div style="font-weight:700;">${escapeHtml(f.title)}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtml(f.recipient_username)} · ${formatAmount(f.amount)}</div>
      </div>
      <div class="admin-row__actions">
        <span class="status-pill status-pill--${f.paid ? 'paid' : 'unpaid'}">${f.paid ? 'Оплачено' : 'Не оплачено'}</span>
        <button class="btn btn--small btn--danger" data-delete-fine="${f.id}">Удалить</button>
      </div>
    </div>
  `;
}

/* ---------- Новости (создание/редактирование/удаление) ---------- */

async function fillAdminNews(content) {
  const news = await Gov.getNews();

  content.innerHTML = `
    <div class="section glass" style="padding:16px;">
      <div class="section-title">Новая новость</div>
      <form id="news-form">
        <div class="field"><label for="nw-title">Заголовок</label><input id="nw-title" type="text" required /></div>
        <div class="field"><label for="nw-content">Текст</label><textarea id="nw-content" required></textarea></div>
        <button type="submit" class="btn btn--primary" id="nw-submit">Опубликовать</button>
      </form>
    </div>
    <div class="section mt-24">
      ${news.length === 0 ? `<p class="text-muted">Новостей пока нет</p>` : news.map(renderAdminNewsRow).join('')}
    </div>
  `;

  qs('#news-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#nw-submit');
    btn.disabled = true;
    try {
      await Gov.createNews({ title: qs('#nw-title').value.trim(), content: qs('#nw-content').value.trim() });
      showSuccess('Новость опубликована');
      refreshAdminContent();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  qsa('[data-edit-news]').forEach((btn) => {
    btn.addEventListener('click', () => openEditNewsSheet(news.find((n) => String(n.id) === btn.dataset.editNews)));
  });

  qsa('[data-delete-news]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить новость?')) return;
      btn.disabled = true;
      try {
        await Gov.deleteNews(btn.dataset.deleteNews);
        showSuccess('Новость удалена');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderAdminNewsRow(n) {
  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="item-card__title">${escapeHtml(n.title)}</div>
      <div class="item-card__desc">${escapeHtml(n.content)}</div>
      <div class="item-card__footer mt-8">
        <div class="item-card__meta">${formatDateTime(n.created_at)}</div>
        <div class="admin-row__actions">
          <button class="btn btn--small btn--ghost" data-edit-news="${n.id}">Изменить</button>
          <button class="btn btn--small btn--danger" data-delete-news="${n.id}">Удалить</button>
        </div>
      </div>
    </div>
  `;
}

function openEditNewsSheet(news) {
  if (!news) return;
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 class="text-center mb-8">Редактировать новость</h3>
      <form id="edit-news-form" class="mt-16">
        <div class="field"><label>Заголовок</label><input id="en-title" type="text" value="${escapeHtml(news.title)}" required /></div>
        <div class="field"><label>Текст</label><textarea id="en-content" required>${escapeHtml(news.content)}</textarea></div>
        <button type="submit" class="btn btn--primary" id="en-submit">Сохранить</button>
        <button type="button" class="btn btn--ghost mt-8" id="en-cancel">Отмена</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('sheet-overlay--visible'));
  qs('#en-cancel', overlay).addEventListener('click', () => closeOverlay(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(overlay); });

  qs('#edit-news-form', overlay).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#en-submit', overlay);
    btn.disabled = true;
    try {
      await Gov.updateNews(news.id, {
        title: qs('#en-title', overlay).value.trim(),
        content: qs('#en-content', overlay).value.trim()
      });
      showSuccess('Новость обновлена');
      closeOverlay(overlay);
      refreshAdminContent();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- Голосования ---------- */

async function fillAdminVotes(content) {
  const votes = await Gov.listVotesWithStats();

  content.innerHTML = `
    <div class="section glass" style="padding:16px;">
      <div class="section-title">Новое голосование</div>
      <form id="vote-form">
        <div class="field"><label for="vt-title">Заголовок</label><input id="vt-title" type="text" required /></div>
        <div class="field"><label for="vt-desc">Описание</label><input id="vt-desc" type="text" /></div>
        <div class="field"><label for="vt-opt1">Вариант 1</label><input id="vt-opt1" type="text" required /></div>
        <div class="field"><label for="vt-opt2">Вариант 2</label><input id="vt-opt2" type="text" required /></div>
        <div class="field"><label for="vt-opt3">Вариант 3 (необязательно)</label><input id="vt-opt3" type="text" /></div>
        <button type="submit" class="btn btn--primary" id="vt-submit">Создать</button>
      </form>
    </div>
    <div class="section mt-24">
      ${votes.length === 0 ? `<p class="text-muted">Голосований пока нет</p>` : votes.map(renderAdminVoteRow).join('')}
    </div>
  `;

  qs('#vote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#vt-submit');
    btn.disabled = true;
    try {
      await Gov.createVote({
        title: qs('#vt-title').value.trim(),
        description: qs('#vt-desc').value.trim(),
        option1: qs('#vt-opt1').value.trim(),
        option2: qs('#vt-opt2').value.trim(),
        option3: qs('#vt-opt3').value.trim()
      });
      showSuccess('Голосование создано');
      refreshAdminContent();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  qsa('[data-vote-adjust]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Gov.adminAdjustVoteCount(btn.dataset.voteAdjust, btn.dataset.option, Number(btn.dataset.delta));
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-end-vote]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Завершить голосование? Победитель определится автоматически по числу голосов.')) return;
      btn.disabled = true;
      try {
        await Gov.endVote(btn.dataset.endVote);
        showSuccess('Голосование завершено');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });

  qsa('[data-delete-vote]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить голосование безвозвратно вместе со всеми голосами?')) return;
      btn.disabled = true;
      try {
        await Gov.deleteVote(btn.dataset.deleteVote);
        showSuccess('Голосование удалено');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderAdminVoteRow(vote) {
  const options = [
    { label: vote.option1, count: vote.counts.option1 },
    { label: vote.option2, count: vote.counts.option2 },
    ...(vote.option3 ? [{ label: vote.option3, count: vote.counts.option3 }] : [])
  ];

  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="flex-between">
        <div class="item-card__title">${escapeHtml(vote.title)}</div>
        <span class="chip ${vote.active ? 'chip--active' : ''}">${vote.active ? 'Активно' : 'Завершено'}</span>
      </div>
      <div class="item-card__desc">${escapeHtml(vote.description || '')}</div>
      <div class="mt-16">
        ${options
          .map((o) => {
            const pct = vote.totalVotes > 0 ? Math.round((o.count / vote.totalVotes) * 100) : 0;
            return `
            <div class="vote-stat-row">
              <span>${escapeHtml(o.label)}${!vote.active && o.label === vote.winner_option ? ' 🏆' : ''}</span>
              <span class="flex-row">
                ${o.count} (${pct}%)
                ${
                  vote.active
                    ? `<button class="btn btn--small btn--ghost" style="padding:2px 8px;" data-vote-adjust="${vote.id}" data-option="${escapeHtml(o.label)}" data-delta="-1">−</button>
                       <button class="btn btn--small btn--ghost" style="padding:2px 8px;" data-vote-adjust="${vote.id}" data-option="${escapeHtml(o.label)}" data-delta="1">+</button>`
                    : ''
                }
              </span>
            </div>
            <div class="vote-stat-bar"><div class="vote-stat-bar__fill" style="width:${pct}%;"></div></div>
          `;
          })
          .join('')}
        <div class="item-card__meta mt-8">Всего голосов: ${vote.totalVotes}</div>
      </div>
      <div class="admin-row__actions mt-16">
        ${vote.active ? `<button class="btn btn--small btn--primary" data-end-vote="${vote.id}">Завершить</button>` : ''}
        <button class="btn btn--small btn--danger" data-delete-vote="${vote.id}">Удалить</button>
      </div>
    </div>
  `;
}

/* ---------- Обращения ---------- */

async function fillAdminAppeals(content) {
  const appeals = await Gov.listAllAppeals();

  content.innerHTML =
    appeals.length === 0
      ? `<p class="text-muted text-center mt-24">Обращений пока нет</p>`
      : appeals.map(renderAdminAppealRow).join('');

  qsa('[data-reply-appeal]').forEach((btn) => {
    btn.addEventListener('click', () => openReplyAppealSheet(btn.dataset.replyAppeal));
  });

  qsa('[data-delete-appeal]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить обращение безвозвратно?')) return;
      btn.disabled = true;
      try {
        await Gov.deleteAppeal(btn.dataset.deleteAppeal);
        showSuccess('Обращение удалено');
        refreshAdminContent();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderAdminAppealRow(a) {
  return `
    <div class="item-card glass anim-fade-in-up">
      <div class="flex-between">
        <div class="item-card__title">${escapeHtml(a.username)}</div>
        <span class="status-pill status-pill--${a.status === 'closed' ? 'closed' : 'pending'}">${CONFIG.STATUS_LABELS[a.status]}</span>
      </div>
      <div class="item-card__desc mt-8">${escapeHtml(a.message)}</div>
      ${a.admin_reply ? `<div class="info-card glass mt-8" style="padding:10px 12px;"><div class="info-card__label">Ответ</div><div class="info-card__value" style="font-size:14px;font-weight:400;">${escapeHtml(a.admin_reply)}</div></div>` : ''}
      <div class="admin-row__actions mt-8">
        ${a.status !== 'closed' ? `<button class="btn btn--small btn--primary" data-reply-appeal="${a.id}">Ответить</button>` : ''}
        <button class="btn btn--small btn--danger" data-delete-appeal="${a.id}">Удалить</button>
      </div>
    </div>
  `;
}

function openReplyAppealSheet(appealId) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <h3 class="text-center mb-8">Ответить на обращение</h3>
      <form id="reply-form" class="mt-16">
        <div class="field"><textarea id="reply-text" placeholder="Текст ответа" required></textarea></div>
        <button type="submit" class="btn btn--primary" id="reply-submit">Отправить и закрыть</button>
        <button type="button" class="btn btn--ghost mt-8" id="reply-cancel">Отмена</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('sheet-overlay--visible'));
  qs('#reply-cancel', overlay).addEventListener('click', () => closeOverlay(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(overlay); });

  qs('#reply-form', overlay).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#reply-submit', overlay);
    btn.disabled = true;
    try {
      await Gov.replyToAppeal(appealId, qs('#reply-text', overlay).value.trim());
      showSuccess('Ответ отправлен');
      closeOverlay(overlay);
      refreshAdminContent();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ==================== СТАРТ ==================== */

document.addEventListener('DOMContentLoaded', bootstrap);
window.__forkuslugiLogout = logout;
