// Forkuslugi
// Аутентификация через таблицу users (та же таблица, что и в F-BANK)

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

const SESSION_KEY = 'forkuslugi_session';

/**
 * Логин по username + password.
 * Пароли хранятся в открытом виде в таблице users.
 */
export async function login(username, password) {
  const client = getSupabaseClient();

  let data, error;
  try {
    const result = await client
      .from(CONFIG.TABLES.USERS)
      .select('*')
      .eq('username', username)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (networkError) {
    console.error('[Forkuslugi] Сетевая ошибка при логине:', networkError.name, networkError.message, networkError);
    throw new Error(networkError.message || 'Сервер не отвечает');
  }

  if (error) {
    console.error('[Forkuslugi] Ошибка Supabase при логине:', {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw new Error(error.message || `Ошибка сервера (код ${error.code || error.status || '?'})`);
  }

  if (!data) {
    throw new Error('Неверный логин или пароль');
  }

  if (data.password !== password) {
    throw new Error('Неверный логин или пароль');
  }

  setSession(data);
  return data;
}

export function setSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function updateSessionUser(partialUser) {
  const current = getSession();
  if (!current) return;
  const updated = { ...current, ...partialUser };
  setSession(updated);
}

export function isAdmin(user) {
  return !!user && user.username === 'admin' && user.role === CONFIG.ROLES.ADMIN;
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Перечитывает актуальные данные пользователя из БД
 */
export async function refreshCurrentUser() {
  const session = getSession();
  if (!session) return null;

  const client = getSupabaseClient();

  let data, error;
  try {
    const result = await client
      .from(CONFIG.TABLES.USERS)
      .select('*')
      .eq('username', session.username)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (networkError) {
    console.error('[Forkuslugi] Сетевая ошибка при проверке сессии:', networkError.name, networkError.message, networkError);
    throw new Error(networkError.message || 'Сервер не отвечает');
  }

  if (error) {
    console.error('[Forkuslugi] Ошибка Supabase при проверке сессии:', {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw new Error(error.message || `Ошибка сервера (код ${error.code || error.status || '?'})`);
  }

  if (!data) {
    clearSession();
    return null;
  }

  setSession(data);
  return data;
}
