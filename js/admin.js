// Forkuslugi
// Админ-панель. Доступна только username === 'admin' && role === 'admin'

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';
import { createNotification } from './government.js';

const TABLES = CONFIG.TABLES;
const STATUS = CONFIG.STATUS;

/* ==================== ПРОФЕССИИ ==================== */

export async function listProfessions() {
  const client = getSupabaseClient();

  const [{ data: professions, error: profError }, { data: employed, error: empError }] = await Promise.all([
    client.from(TABLES.PROFESSIONS).select('*').order('created_at', { ascending: false }),
    client.from(TABLES.USERS).select('profession_id').not('profession_id', 'is', null)
  ]);

  if (profError || empError) {
    throw new Error('Не удалось загрузить профессии');
  }

  return (professions || []).map((p) => ({
    ...p,
    employedCount: (employed || []).filter((u) => u.profession_id === p.id).length
  }));
}

export async function createProfession({ title, description, salary, max_employees }) {
  const client = getSupabaseClient();

  if (!title) {
    throw new Error('Введите название профессии');
  }

  const { error } = await client.from(TABLES.PROFESSIONS).insert({
    title,
    description: description || '',
    salary: Number(salary) || 0,
    max_employees: Number(max_employees) || 0,
    active: true
  });

  if (error) {
    throw new Error('Не удалось создать профессию');
  }
}

export async function setProfessionActive(professionId, active) {
  const client = getSupabaseClient();
  const { error } = await client
    .from(TABLES.PROFESSIONS)
    .update({ active })
    .eq('id', professionId);

  if (error) {
    throw new Error('Не удалось изменить статус профессии');
  }
}

export async function deleteProfession(professionId) {
  const client = getSupabaseClient();

  // Освобождаем всех сотрудников этой профессии, чтобы не оставить "битую" ссылку
  await client
    .from(TABLES.USERS)
    .update({ profession_id: null, salary: 0 })
    .eq('profession_id', professionId);

  await client.from(TABLES.JOB_APPLICATIONS).delete().eq('profession_id', professionId);

  const { error } = await client.from(TABLES.PROFESSIONS).delete().eq('id', professionId);

  if (error) {
    throw new Error('Не удалось удалить профессию');
  }
}

/**
 * Выплачивает зарплату всем сотрудникам конкретной профессии.
 * Каждый получает сумму profession.salary на баланс F-BANK + запись в transactions.
 */
export async function paySalaryForProfession(professionId) {
  const client = getSupabaseClient();

  const { data: profession, error: profError } = await client
    .from(TABLES.PROFESSIONS)
    .select('*')
    .eq('id', professionId)
    .maybeSingle();

  if (profError || !profession) {
    throw new Error('Профессия не найдена');
  }

  const { data: employees, error: empError } = await client
    .from(TABLES.USERS)
    .select('username, balance')
    .eq('profession_id', professionId);

  if (empError) {
    throw new Error('Не удалось загрузить сотрудников');
  }

  if (!employees || employees.length === 0) {
    throw new Error('На этой профессии пока никто не работает');
  }

  const salary = Number(profession.salary) || 0;

  await Promise.all(
    employees.map((emp) =>
      client.from(TABLES.USERS).update({ balance: Number(emp.balance) + salary }).eq('username', emp.username)
    )
  );

  await Promise.all(
    employees.map((emp) =>
      client.from(TABLES.TRANSACTIONS).insert({
        username: emp.username,
        type: 'salary',
        description: `Зарплата: ${profession.title}`,
        amount: salary,
        date: new Date().toISOString()
      })
    )
  );

  await Promise.all(
    employees.map((emp) =>
      createNotification(emp.username, 'Начислена зарплата', `${profession.title}: ${salary} DUM`)
    )
  );

  return employees.length;
}

/**
 * Выплачивает зарплату сразу по всем активным профессиям.
 */
export async function paySalaryForAllProfessions() {
  const client = getSupabaseClient();

  const { data: professions, error } = await client.from(TABLES.PROFESSIONS).select('*');

  if (error) {
    throw new Error('Не удалось загрузить профессии');
  }

  let totalPaid = 0;
  for (const profession of professions || []) {
    try {
      const count = await paySalaryForProfession(profession.id);
      totalPaid += count;
    } catch (e) {
      // Пропускаем профессии без сотрудников — это не ошибка
    }
  }

  return totalPaid;
}

/* ==================== ЗАЯВКИ НА РАБОТУ / УВОЛЬНЕНИЕ ==================== */

export async function listJobApplications() {
  const client = getSupabaseClient();

  const [{ data: applications, error: appError }, { data: professions, error: profError }] = await Promise.all([
    client.from(TABLES.JOB_APPLICATIONS).select('*').order('created_at', { ascending: false }),
    client.from(TABLES.PROFESSIONS).select('*')
  ]);

  if (appError || profError) {
    throw new Error('Не удалось загрузить заявки');
  }

  return (applications || []).map((app) => ({
    ...app,
    profession: (professions || []).find((p) => p.id === app.profession_id) || null
  }));
}

/**
 * Одобряет заявку на трудоустройство: назначает профессию и зарплату,
 * проверяет лимит мест.
 */
export async function approveHireApplication(applicationId) {
  const client = getSupabaseClient();

  const { data: app, error: appError } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();

  if (appError || !app) {
    throw new Error('Заявка не найдена');
  }

  if (app.status !== STATUS.PENDING) {
    throw new Error('Заявка уже обработана');
  }

  const { data: profession, error: profError } = await client
    .from(TABLES.PROFESSIONS)
    .select('*')
    .eq('id', app.profession_id)
    .maybeSingle();

  if (profError || !profession) {
    throw new Error('Профессия не найдена');
  }

  if (profession.max_employees > 0) {
    const { count, error: countError } = await client
      .from(TABLES.USERS)
      .select('id', { count: 'exact', head: true })
      .eq('profession_id', profession.id);

    if (countError) {
      throw new Error('Ошибка проверки количества сотрудников');
    }

    if ((count || 0) >= profession.max_employees) {
      throw new Error('Свободных мест на этой профессии больше нет');
    }
  }

  const { error: userError } = await client
    .from(TABLES.USERS)
    .update({ profession_id: profession.id, salary: profession.salary })
    .eq('username', app.username);

  if (userError) {
    throw new Error('Не удалось назначить профессию');
  }

  await client.from(TABLES.JOB_APPLICATIONS).update({ status: STATUS.APPROVED }).eq('id', applicationId);
  await createNotification(app.username, 'Заявка одобрена', `Вы приняты на должность «${profession.title}»`);
}

export async function rejectHireApplication(applicationId) {
  const client = getSupabaseClient();

  const { data: app } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();

  const { error } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .update({ status: STATUS.REJECTED })
    .eq('id', applicationId);

  if (error) {
    throw new Error('Не удалось отклонить заявку');
  }

  if (app) {
    await createNotification(app.username, 'Заявка отклонена', 'Ваша заявка на трудоустройство отклонена');
  }
}

/**
 * Подтверждает увольнение: снимает профессию и зарплату с пользователя.
 */
export async function approveResignation(applicationId) {
  const client = getSupabaseClient();

  const { data: app, error: appError } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();

  if (appError || !app) {
    throw new Error('Заявка не найдена');
  }

  const { error: userError } = await client
    .from(TABLES.USERS)
    .update({ profession_id: null, salary: 0 })
    .eq('username', app.username);

  if (userError) {
    throw new Error('Не удалось уволить гражданина');
  }

  await client.from(TABLES.JOB_APPLICATIONS).update({ status: STATUS.APPROVED }).eq('id', applicationId);
  await createNotification(app.username, 'Увольнение подтверждено', 'Вы уволены с занимаемой должности');
}

export async function rejectResignation(applicationId) {
  const client = getSupabaseClient();

  const { data: app } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();

  const { error } = await client
    .from(TABLES.JOB_APPLICATIONS)
    .update({ status: STATUS.REJECTED })
    .eq('id', applicationId);

  if (error) {
    throw new Error('Не удалось отклонить заявку');
  }

  if (app) {
    await createNotification(app.username, 'Заявка отклонена', 'Ваша заявка на увольнение отклонена');
  }
}

/* ==================== ИМУЩЕСТВО ==================== */

export async function listProperties() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.PROPERTIES)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Не удалось загрузить имущество');
  return data || [];
}

export async function approveProperty(propertyId) {
  const client = getSupabaseClient();

  const { data: property } = await client
    .from(TABLES.PROPERTIES)
    .select('*')
    .eq('id', propertyId)
    .maybeSingle();

  const { error } = await client
    .from(TABLES.PROPERTIES)
    .update({ status: STATUS.APPROVED })
    .eq('id', propertyId);

  if (error) throw new Error('Не удалось подтвердить регистрацию');

  if (property) {
    await createNotification(
      property.owner_username,
      'Регистрация подтверждена',
      `«${property.title}» успешно зарегистрировано`
    );
  }
}

export async function rejectProperty(propertyId) {
  const client = getSupabaseClient();

  const { data: property } = await client
    .from(TABLES.PROPERTIES)
    .select('*')
    .eq('id', propertyId)
    .maybeSingle();

  const { error } = await client
    .from(TABLES.PROPERTIES)
    .update({ status: STATUS.REJECTED })
    .eq('id', propertyId);

  if (error) throw new Error('Не удалось отклонить регистрацию');

  if (property) {
    await createNotification(
      property.owner_username,
      'Регистрация отклонена',
      `Заявка на «${property.title}» отклонена`
    );
  }
}

export async function listPropertyTransfers() {
  const client = getSupabaseClient();

  const [{ data: transfers, error: trError }, { data: properties, error: propError }] = await Promise.all([
    client.from(TABLES.PROPERTY_TRANSFERS).select('*').order('created_at', { ascending: false }),
    client.from(TABLES.PROPERTIES).select('*')
  ]);

  if (trError || propError) throw new Error('Не удалось загрузить заявки на передачу');

  return (transfers || []).map((t) => ({
    ...t,
    property: (properties || []).find((p) => p.id === t.property_id) || null
  }));
}

export async function approvePropertyTransfer(transferId) {
  const client = getSupabaseClient();

  const { data: transfer, error: transferError } = await client
    .from(TABLES.PROPERTY_TRANSFERS)
    .select('*')
    .eq('id', transferId)
    .maybeSingle();

  if (transferError || !transfer) throw new Error('Заявка не найдена');

  const { error: propError } = await client
    .from(TABLES.PROPERTIES)
    .update({ owner_username: transfer.to_username })
    .eq('id', transfer.property_id);

  if (propError) throw new Error('Не удалось передать имущество');

  await client
    .from(TABLES.PROPERTY_TRANSFERS)
    .update({ status: STATUS.APPROVED })
    .eq('id', transferId);

  await createNotification(transfer.to_username, 'Имущество передано', 'Вам передано имущество, подтверждено администратором');
  await createNotification(transfer.from_username, 'Передача подтверждена', 'Ваша заявка на передачу имущества одобрена');
}

export async function rejectPropertyTransfer(transferId) {
  const client = getSupabaseClient();

  const { data: transfer } = await client
    .from(TABLES.PROPERTY_TRANSFERS)
    .select('*')
    .eq('id', transferId)
    .maybeSingle();

  const { error } = await client
    .from(TABLES.PROPERTY_TRANSFERS)
    .update({ status: STATUS.REJECTED })
    .eq('id', transferId);

  if (error) throw new Error('Не удалось отклонить заявку');

  if (transfer) {
    await createNotification(transfer.from_username, 'Передача отклонена', 'Заявка на передачу имущества отклонена');
  }
}

/* ==================== НАЛОГИ ==================== */

export async function listTaxes() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.TAXES)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Не удалось загрузить налоги');
  return data || [];
}

export async function createTax({ title, description, amount, recipient_username, due_date }) {
  const client = getSupabaseClient();

  if (!title || !recipient_username) {
    throw new Error('Укажите название и получателя');
  }

  const { data: recipient, error: recipientError } = await client
    .from(TABLES.USERS)
    .select('username')
    .eq('username', recipient_username)
    .maybeSingle();

  if (recipientError || !recipient) {
    throw new Error('Гражданин-получатель не найден');
  }

  const { error } = await client.from(TABLES.TAXES).insert({
    title,
    description: description || '',
    amount: Number(amount) || 0,
    recipient_username,
    due_date: due_date || null,
    paid: false
  });

  if (error) throw new Error('Не удалось создать налог');

  await createNotification(recipient_username, 'Начислен налог', `${title}: ${Number(amount) || 0} DUM`);
}

/**
 * Начисляет один и тот же налог сразу всем гражданам (кроме admin).
 * Создаёт отдельную запись в таблице taxes на каждого — это разумный
 * компромисс, так как оплата и статус paid у каждого гражданина свои.
 */
export async function createTaxForAll({ title, description, amount, due_date }) {
  const client = getSupabaseClient();

  if (!title) {
    throw new Error('Укажите название налога');
  }

  const { data: users, error: usersError } = await client
    .from(TABLES.USERS)
    .select('username')
    .neq('username', 'admin');

  if (usersError) {
    throw new Error('Не удалось загрузить список граждан');
  }

  if (!users || users.length === 0) {
    throw new Error('Граждан пока нет');
  }

  const rows = users.map((u) => ({
    title,
    description: description || '',
    amount: Number(amount) || 0,
    recipient_username: u.username,
    due_date: due_date || null,
    paid: false
  }));

  const { error } = await client.from(TABLES.TAXES).insert(rows);

  if (error) {
    throw new Error('Не удалось начислить налог всем гражданам');
  }

  await Promise.all(
    users.map((u) =>
      createNotification(u.username, 'Начислен налог', `${title}: ${Number(amount) || 0} DUM`)
    )
  );

  return users.length;
}

export async function deleteTax(taxId) {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLES.TAXES).delete().eq('id', taxId);
  if (error) throw new Error('Не удалось удалить налог');
}

/* ==================== ШТРАФЫ ==================== */

export async function listFines() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.FINES)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Не удалось загрузить штрафы');
  return data || [];
}

export async function createFine({ title, description, amount, recipient_username }) {
  const client = getSupabaseClient();

  if (!title || !recipient_username) {
    throw new Error('Укажите название и получателя');
  }

  const { data: recipient, error: recipientError } = await client
    .from(TABLES.USERS)
    .select('username')
    .eq('username', recipient_username)
    .maybeSingle();

  if (recipientError || !recipient) {
    throw new Error('Гражданин-получатель не найден');
  }

  const { error } = await client.from(TABLES.FINES).insert({
    title,
    description: description || '',
    amount: Number(amount) || 0,
    recipient_username,
    paid: false
  });

  if (error) throw new Error('Не удалось создать штраф');

  await createNotification(recipient_username, 'Начислен штраф', `${title}: ${Number(amount) || 0} DUM`);
}

/**
 * Начисляет один и тот же штраф сразу всем гражданам (кроме admin).
 */
export async function createFineForAll({ title, description, amount }) {
  const client = getSupabaseClient();

  if (!title) {
    throw new Error('Укажите название штрафа');
  }

  const { data: users, error: usersError } = await client
    .from(TABLES.USERS)
    .select('username')
    .neq('username', 'admin');

  if (usersError) {
    throw new Error('Не удалось загрузить список граждан');
  }

  if (!users || users.length === 0) {
    throw new Error('Граждан пока нет');
  }

  const rows = users.map((u) => ({
    title,
    description: description || '',
    amount: Number(amount) || 0,
    recipient_username: u.username,
    paid: false
  }));

  const { error } = await client.from(TABLES.FINES).insert(rows);

  if (error) {
    throw new Error('Не удалось начислить штраф всем гражданам');
  }

  await Promise.all(
    users.map((u) =>
      createNotification(u.username, 'Начислен штраф', `${title}: ${Number(amount) || 0} DUM`)
    )
  );

  return users.length;
}

export async function deleteFine(fineId) {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLES.FINES).delete().eq('id', fineId);
  if (error) throw new Error('Не удалось удалить штраф');
}

/* ==================== ПОЛЬЗОВАТЕЛИ ==================== */

export async function listAllUsersWithProfessions() {
  const client = getSupabaseClient();

  const [{ data: users, error: userError }, { data: professions, error: profError }] = await Promise.all([
    client.from(TABLES.USERS).select('*').neq('username', 'admin').order('joined', { ascending: false }),
    client.from(TABLES.PROFESSIONS).select('*')
  ]);

  if (userError || profError) throw new Error('Не удалось загрузить пользователей');

  return (users || []).map((u) => ({
    ...u,
    profession: (professions || []).find((p) => p.id === u.profession_id) || null
  }));
}
