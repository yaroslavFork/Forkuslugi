// Forkuslugi
// Глобальная конфигурация приложения.
// Использует тот же проект Supabase и ту же таблицу users, что и F-BANK.

export const CONFIG = {
  SUPABASE_URL: 'https://monyjcyypnqknrzzxjej.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbnlqY3l5cG5xa25yenp4amVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTIyMTQsImV4cCI6MjA5NzcyODIxNH0.OQsb1EunHj8tXj22iGu4AJUc_DwgioAD8TnTNJ8PA9A',

  SDK_URL: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  SDK_LOAD_TIMEOUT_MS: 8000,

  COUNTRY: 'Forklandia',
  CURRENCY_CODE: 'DUM',
  CURRENCY_NAME: 'Дамблы',

  TOAST_DURATION_MS: 3500,

  TABLES: {
    USERS: 'users',
    PROFESSIONS: 'professions',
    JOB_APPLICATIONS: 'job_applications',
    PROPERTIES: 'properties',
    PROPERTY_TRANSFERS: 'property_transfers',
    TAXES: 'taxes',
    FINES: 'fines',
    NEWS: 'news',
    NOTIFICATIONS: 'notifications',
    VOTES: 'votes',
    VOTE_RECORDS: 'vote_records',
    APPEALS: 'appeals',
    // Таблицы F-BANK, нужны только для списания при оплате налогов/штрафов
    TRANSACTIONS: 'transactions'
  },

  REALTIME_TABLES: [
    'professions',
    'job_applications',
    'properties',
    'property_transfers',
    'taxes',
    'fines',
    'news',
    'notifications',
    'votes',
    'vote_records',
    'appeals',
    'users'
  ],

  PROPERTY_CATEGORIES: {
    REALTY: 'realty',
    TRANSPORT: 'transport',
    BUSINESS: 'business'
  },

  PROPERTY_CATEGORY_LABELS: {
    realty: 'Недвижимость',
    transport: 'Транспорт',
    business: 'Бизнес'
  },

  STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CLOSED: 'closed'
  },

  STATUS_LABELS: {
    pending: 'На рассмотрении',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    closed: 'Закрыто'
  },

  ROLES: {
    ADMIN: 'admin',
    CITIZEN: 'citizen'
  }
};
