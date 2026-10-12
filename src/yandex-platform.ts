import type { YandexSDK } from './no-ads';

declare global {
  interface Window { YaGames?: { init(): Promise<YandexSDK> }; }
}

/** Normal local builds never request a platform SDK or imitate a payment. */
export async function loadYandexPlatform(): Promise<YandexSDK | null> {
  if (!window.YaGames && import.meta.env.VITE_YANDEX_GAMES !== '1') return null;
  if (!window.YaGames) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => finish(new Error('Platform SDK unavailable')), 8000);
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      script.src = '/sdk.js';
      script.async = true;
      script.onload = () => finish();
      script.onerror = () => finish(new Error('Platform SDK unavailable'));
      document.head.append(script);
    });
  }
  if (!window.YaGames) throw new Error('Platform SDK unavailable');
  return window.YaGames.init();
}
