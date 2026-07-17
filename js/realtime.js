// Forkuslugi
// Realtime-подписки. При логауте ВСЕ каналы обязаны сниматься через removeChannel().
//
// Важно: все таблицы слушаются через ОДИН канал (несколько .on() на одном .channel()),
// а не через отдельный канал на каждую таблицу — иначе на медленном мобильном
// интернете открытие 12 параллельных websocket-соединений сильно тормозит загрузку.

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

let activeChannel = null;

/**
 * Запускает realtime-подписку на все нужные таблицы через один канал.
 * callbacks: { onChange(table, payload) } — единый обработчик с именем таблицы.
 */
export function initRealtime(onChange) {
  const client = getSupabaseClient();

  let channel = client.channel('realtime-forkuslugi');

  CONFIG.REALTIME_TABLES.forEach((table) => {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        if (typeof onChange === 'function') onChange(table, payload);
      }
    );
  });

  channel.subscribe();
  activeChannel = channel;
}

/**
 * Снимает активную realtime-подписку. Обязательно вызывается при логауте.
 */
export function removeAllChannels() {
  if (!activeChannel) return;
  const client = getSupabaseClient();
  try {
    client.removeChannel(activeChannel);
  } catch (e) {
    // канал уже мог быть снят — игнорируем
  }
  activeChannel = null;
}
