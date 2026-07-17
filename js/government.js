// Forkuslugi
// Раздел "Государство": новости, уведомления, голосования, обращения

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

const TABLES = CONFIG.TABLES;

/* ==================== НОВОСТИ ==================== */

export async function getNews() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.NEWS)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Не удалось загрузить новости');
  return data || [];
}

export async function createNews({ title, content }) {
  const client = getSupabaseClient();
  if (!title || !content) throw new Error('Заполните заголовок и текст новости');

  const { error } = await client.from(TABLES.NEWS).insert({ title, content });
  if (error) throw new Error('Не удалось опубликовать новость');
}

export async function updateNews(newsId, { title, content }) {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLES.NEWS).update({ title, content }).eq('id', newsId);
  if (error) throw new Error('Не удалось отредактировать новость');
}

export async function deleteNews(newsId) {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLES.NEWS).delete().eq('id', newsId);
  if (error) throw new Error('Не удалось удалить новость');
}

/* ==================== УВЕДОМЛЕНИЯ ==================== */

export async function getUserNotifications(username) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.NOTIFICATIONS)
    .select('*')
    .eq('username', username)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Не удалось загрузить уведомления');
  return data || [];
}

export async function createNotification(username, title, message) {
  const client = getSupabaseClient();
  await client.from(TABLES.NOTIFICATIONS).insert({ username, title, message: message || '' });
}

export async function markNotificationRead(notificationId) {
  const client = getSupabaseClient();
  await client.from(TABLES.NOTIFICATIONS).update({ read: true }).eq('id', notificationId);
}

/* ==================== ГОЛОСОВАНИЯ ==================== */

/**
 * Список голосований для гражданина.
 * Активные — без статистики. Завершённые — только победитель, без цифр.
 */
export async function getVotesForCitizen(username) {
  const client = getSupabaseClient();

  const [{ data: votes, error: votesError }, { data: myRecords, error: recordsError }] = await Promise.all([
    client.from(TABLES.VOTES).select('*').order('created_at', { ascending: false }),
    client.from(TABLES.VOTE_RECORDS).select('vote_id, option_chosen').eq('username', username)
  ]);

  if (votesError || recordsError) {
    throw new Error('Не удалось загрузить голосования');
  }

  return (votes || []).map((vote) => {
    const myRecord = (myRecords || []).find((r) => r.vote_id === vote.id);
    return {
      ...vote,
      hasVoted: !!myRecord,
      myChoice: myRecord ? myRecord.option_chosen : null
    };
  });
}

/**
 * Голосует за вариант. Один раз на человека, только пока голосование активно.
 */
export async function castVote(voteId, username, optionChosen) {
  const client = getSupabaseClient();

  const { data: vote, error: voteError } = await client
    .from(TABLES.VOTES)
    .select('*')
    .eq('id', voteId)
    .maybeSingle();

  if (voteError || !vote) {
    throw new Error('Голосование не найдено');
  }

  if (!vote.active) {
    throw new Error('Голосование уже завершено');
  }

  const { data: existing, error: existingError } = await client
    .from(TABLES.VOTE_RECORDS)
    .select('id')
    .eq('vote_id', voteId)
    .eq('username', username)
    .maybeSingle();

  if (existingError) {
    throw new Error('Ошибка проверки голоса');
  }

  if (existing) {
    throw new Error('Вы уже проголосовали');
  }

  const { error } = await client.from(TABLES.VOTE_RECORDS).insert({
    vote_id: voteId,
    username,
    option_chosen: optionChosen
  });

  if (error) {
    throw new Error('Не удалось учесть голос');
  }
}

/* ---------- Голосования: администратор ---------- */

export async function listVotesWithStats() {
  const client = getSupabaseClient();

  const [{ data: votes, error: votesError }, { data: records, error: recordsError }] = await Promise.all([
    client.from(TABLES.VOTES).select('*').order('created_at', { ascending: false }),
    client.from(TABLES.VOTE_RECORDS).select('*')
  ]);

  if (votesError || recordsError) {
    throw new Error('Не удалось загрузить голосования');
  }

  return (votes || []).map((vote) => {
    const voteRecords = (records || []).filter((r) => r.vote_id === vote.id);
    const counts = { option1: 0, option2: 0, option3: 0 };
    voteRecords.forEach((r) => {
      if (r.option_chosen === vote.option1) counts.option1++;
      else if (r.option_chosen === vote.option2) counts.option2++;
      else if (vote.option3 && r.option_chosen === vote.option3) counts.option3++;
    });
    return { ...vote, records: voteRecords, counts, totalVotes: voteRecords.length };
  });
}

export async function createVote({ title, description, option1, option2, option3 }) {
  const client = getSupabaseClient();

  if (!title || !option1 || !option2) {
    throw new Error('Заполните заголовок и минимум два варианта');
  }

  const { error } = await client.from(TABLES.VOTES).insert({
    title,
    description: description || '',
    option1,
    option2,
    option3: option3 || null,
    active: true
  });

  if (error) {
    throw new Error('Не удалось создать голосование');
  }
}

/**
 * Завершает голосование. Победитель определяется автоматически по числу голосов,
 * либо администратор может передать winnerOption вручную (переопределение).
 */
export async function endVote(voteId, winnerOptionOverride = null) {
  const client = getSupabaseClient();

  const { data: vote, error: voteError } = await client
    .from(TABLES.VOTES)
    .select('*')
    .eq('id', voteId)
    .maybeSingle();

  if (voteError || !vote) {
    throw new Error('Голосование не найдено');
  }

  let winner = winnerOptionOverride;

  if (!winner) {
    const { data: records } = await client
      .from(TABLES.VOTE_RECORDS)
      .select('option_chosen')
      .eq('vote_id', voteId);

    const counts = {};
    (records || []).forEach((r) => {
      counts[r.option_chosen] = (counts[r.option_chosen] || 0) + 1;
    });

    let max = -1;
    Object.entries(counts).forEach(([option, count]) => {
      if (count > max) {
        max = count;
        winner = option;
      }
    });

    if (!winner) winner = vote.option1; // если никто не голосовал
  }

  const { error } = await client
    .from(TABLES.VOTES)
    .update({ active: false, winner_option: winner })
    .eq('id', voteId);

  if (error) {
    throw new Error('Не удалось завершить голосование');
  }
}

export async function deleteVote(voteId) {
  const client = getSupabaseClient();
  await client.from(TABLES.VOTE_RECORDS).delete().eq('vote_id', voteId);
  const { error } = await client.from(TABLES.VOTES).delete().eq('id', voteId);
  if (error) throw new Error('Не удалось удалить голосование');
}

/**
 * Ручная корректировка результатов голосования администратором (до завершения).
 * Реализована через служебные записи в vote_records с синтетическим username,
 * чтобы не ломать ограничение "один голос — один гражданин" для реальных людей.
 */
export async function adminAdjustVoteCount(voteId, option, delta) {
  const client = getSupabaseClient();

  if (delta > 0) {
    const syntheticUsername = `__admin_adjust_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const { error } = await client.from(TABLES.VOTE_RECORDS).insert({
      vote_id: voteId,
      username: syntheticUsername,
      option_chosen: option
    });
    if (error) throw new Error('Не удалось увеличить счётчик');
  } else {
    const { data: manualRecords, error: findError } = await client
      .from(TABLES.VOTE_RECORDS)
      .select('id, username')
      .eq('vote_id', voteId)
      .eq('option_chosen', option)
      .like('username', '__admin_adjust_%')
      .limit(1);

    if (findError) throw new Error('Не удалось найти запись для уменьшения');

    if (!manualRecords || manualRecords.length === 0) {
      throw new Error('Нельзя уменьшить ниже нуля вручную добавленных голосов');
    }

    const { error } = await client.from(TABLES.VOTE_RECORDS).delete().eq('id', manualRecords[0].id);
    if (error) throw new Error('Не удалось уменьшить счётчик');
  }
}

/* ==================== ОБРАЩЕНИЯ ==================== */

export async function getUserAppeals(username) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.APPEALS)
    .select('*')
    .eq('username', username)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Не удалось загрузить обращения');
  return data || [];
}

export async function createAppeal(username, message) {
  const client = getSupabaseClient();
  if (!message || !message.trim()) throw new Error('Введите текст обращения');

  const { error } = await client.from(TABLES.APPEALS).insert({
    username,
    message: message.trim(),
    status: CONFIG.STATUS.PENDING
  });

  if (error) throw new Error('Не удалось отправить обращение');
}

/* ---------- Обращения: администратор ---------- */

export async function listAllAppeals() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.APPEALS)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Не удалось загрузить обращения');
  return data || [];
}

export async function replyToAppeal(appealId, reply) {
  const client = getSupabaseClient();
  const { error } = await client
    .from(TABLES.APPEALS)
    .update({ admin_reply: reply, status: CONFIG.STATUS.CLOSED })
    .eq('id', appealId);

  if (error) throw new Error('Не удалось отправить ответ');
}

export async function deleteAppeal(appealId) {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLES.APPEALS).delete().eq('id', appealId);
  if (error) throw new Error('Не удалось удалить обращение');
}
