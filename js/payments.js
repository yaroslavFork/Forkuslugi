// Forkuslugi
// Налоги и штрафы. Оплата списывает средства с баланса F-BANK
// и создаёт запись в общей таблице transactions.

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

const TABLES = CONFIG.TABLES;

/* ==================== НАЛОГИ ==================== */

export async function getUserTaxes(username) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(TABLES.TAXES)
    .select('*')
    .eq('recipient_username', username)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Не удалось загрузить налоги');
  }

  return data || [];
}

export async function payTax(taxId, username) {
  return payObligation(TABLES.TAXES, taxId, username, 'Оплата налога');
}

/* ==================== ШТРАФЫ ==================== */

export async function getUserFines(username) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(TABLES.FINES)
    .select('*')
    .eq('recipient_username', username)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Не удалось загрузить штрафы');
  }

  return data || [];
}

export async function payFine(fineId, username) {
  return payObligation(TABLES.FINES, fineId, username, 'Оплата штрафа');
}

/* ==================== ОБЩАЯ ЛОГИКА ОПЛАТЫ ==================== */

async function payObligation(tableName, obligationId, username, txLabel) {
  const client = getSupabaseClient();

  const { data: obligation, error: obligationError } = await client
    .from(tableName)
    .select('*')
    .eq('id', obligationId)
    .maybeSingle();

  if (obligationError || !obligation) {
    throw new Error('Начисление не найдено');
  }

  if (obligation.paid) {
    throw new Error('Уже оплачено');
  }

  const { data: user, error: userError } = await client
    .from(TABLES.USERS)
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (userError || !user) {
    throw new Error('Не удалось получить данные пользователя');
  }

  if (user.frozen) {
    throw new Error('Аккаунт заморожен — оплата недоступна');
  }

  const amount = Number(obligation.amount);

  if (Number(user.balance) < amount) {
    throw new Error('Недостаточно средств на счёте F-BANK');
  }

  const newBalance = Number(user.balance) - amount;

  const { error: balanceError } = await client
    .from(TABLES.USERS)
    .update({ balance: newBalance })
    .eq('username', username);

  if (balanceError) {
    throw new Error('Не удалось списать средства');
  }

  const { error: markPaidError } = await client
    .from(tableName)
    .update({ paid: true, paid_at: new Date().toISOString() })
    .eq('id', obligationId);

  if (markPaidError) {
    // Откатываем списание, если не удалось отметить оплату
    await client.from(TABLES.USERS).update({ balance: user.balance }).eq('username', username);
    throw new Error('Не удалось подтвердить оплату');
  }

  await client.from(TABLES.TRANSACTIONS).insert({
    username,
    type: 'payment',
    description: `${txLabel}: ${obligation.title}`,
    amount: -amount,
    date: new Date().toISOString()
  });

  return newBalance;
}
