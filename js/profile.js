// Forkuslugi
// Профиль гражданина: трудоустройство, увольнение, имущество

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

const TABLES = CONFIG.TABLES;

/* ==================== ПРОФИЛЬ / РАБОТА ==================== */

/**
 * Возвращает актуальные данные пользователя вместе с профессией (если есть)
 */
export async function getProfileData(username) {
  const client = getSupabaseClient();

  const { data: user, error } = await client
    .from(TABLES.USERS)
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error || !user) {
    throw new Error('Не удалось загрузить профиль');
  }

  let profession = null;
  if (user.profession_id) {
    const { data: prof } = await client
      .from(TABLES.PROFESSIONS)
      .select('*')
      .eq('id', user.profession_id)
      .maybeSingle();
    profession = prof || null;
  }

  return { user, profession };
}

/**
 * Список активных профессий с количеством занятых мест (для экрана "Найти работу")
 */
export async function getAvailableProfessions() {
  const client = getSupabaseClient();

  const [{ data: professions, error: profError }, { data: employed, error: empError }] = await Promise.all([
    client.from(TABLES.PROFESSIONS).select('*').eq('active', true).order('created_at', { ascending: false }),
    client.from(TABLES.USERS).select('profession_id').not('profession_id', 'is', null)
  ]);

  if (profError || empError) {
    throw new Error('Не удалось загрузить список профессий');
  }

  return (professions || []).map((p) => {
    const employedCount = (employed || []).filter((u) => u.profession_id === p.id).length;
    return {
      ...p,
      employedCount,
      isFull: p.max_employees > 0 && employedCount >= p.max_employees
    };
  });
}

/**
 * Подаёт заявку на трудоустройство. Один активный запрос на человека.
 */
export async function applyForJob(username, professionId) {
  const client = getSupabaseClient();

  const { data: existing, error: existingError } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .select('id')
    .eq('username', username)
    .eq('status', CONFIG.STATUS.PENDING)
    .maybeSingle();

  if (existingError) {
    throw new Error('Ошибка проверки заявок');
  }

  if (existing) {
    throw new Error('У вас уже есть заявка на рассмотрении');
  }

  const { error } = await client.from(TABLES.JOB_APPLICATIONS).insert({
    username,
    profession_id: professionId,
    type: 'hire',
    status: CONFIG.STATUS.PENDING
  });

  if (error) {
    throw new Error('Не удалось подать заявку');
  }
}

/**
 * Подаёт заявку на увольнение
 */
export async function requestResignation(username, professionId) {
  const client = getSupabaseClient();

  const { data: existing, error: existingError } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .select('id')
    .eq('username', username)
    .eq('type', 'fire')
    .eq('status', CONFIG.STATUS.PENDING)
    .maybeSingle();

  if (existingError) {
    throw new Error('Ошибка проверки заявок');
  }

  if (existing) {
    throw new Error('Заявка на увольнение уже подана');
  }

  const { error } = await client.from(TABLES.JOB_APPLICATIONS).insert({
    username,
    profession_id: professionId,
    type: 'fire',
    status: CONFIG.STATUS.PENDING
  });

  if (error) {
    throw new Error('Не удалось подать заявку на увольнение');
  }
}

/* ==================== ИМУЩЕСТВО ==================== */

/**
 * Возвращает всё имущество, принадлежащее гражданину
 */
export async function getUserProperties(username) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(TABLES.PROPERTIES)
    .select('*')
    .eq('owner_username', username)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Не удалось загрузить имущество');
  }

  return data || [];
}

/**
 * Регистрирует новое имущество (недвижимость / транспорт / бизнес)
 */
export async function registerProperty({ owner, category, title, description, address }) {
  const client = getSupabaseClient();

  if (!title) {
    throw new Error('Укажите название');
  }

  const { error } = await client.from(TABLES.PROPERTIES).insert({
    owner_username: owner,
    category,
    title,
    description: description || '',
    address: address || '',
    status: CONFIG.STATUS.PENDING
  });

  if (error) {
    throw new Error('Не удалось отправить заявку на регистрацию');
  }
}

/**
 * Подаёт заявку на передачу имущества другому гражданину.
 * Само имущество останется у текущего владельца до подтверждения администратором.
 */
export async function requestPropertyTransfer(propertyId, fromUsername, toUsername) {
  const client = getSupabaseClient();

  if (fromUsername === toUsername) {
    throw new Error('Нельзя передать имущество самому себе');
  }

  const { data: recipient, error: recipientError } = await client
    .from(TABLES.USERS)
    .select('username')
    .eq('username', toUsername)
    .maybeSingle();

  if (recipientError || !recipient) {
    throw new Error('Получатель не найден');
  }

  const { data: existing } = await client
    .from(TABLES.PROPERTY_TRANSFERS)
    .select('id')
    .eq('property_id', propertyId)
    .eq('status', CONFIG.STATUS.PENDING)
    .maybeSingle();

  if (existing) {
    throw new Error('Заявка на передачу этого имущества уже отправлена');
  }

  const { error } = await client.from(TABLES.PROPERTY_TRANSFERS).insert({
    property_id: propertyId,
    from_username: fromUsername,
    to_username: toUsername,
    status: CONFIG.STATUS.PENDING
  });

  if (error) {
    throw new Error('Не удалось отправить заявку на передачу');
  }
}
