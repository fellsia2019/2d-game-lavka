import { icon } from './icons';
import type { NoAdsSnapshot } from './no-ads';

const escape = (value: string): string => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

function currencyImage(product: NonNullable<NoAdsSnapshot['product']>): string {
  try {
    const source = product.getPriceCurrencyImage('small');
    const url = new URL(source.startsWith('//') ? `https:${source}` : source);
    if (url.protocol !== 'https:') return '';
    return `<img class="no-ads-currency" src="${escape(url.href)}" width="22" height="22" alt="" aria-hidden="true"/>`;
  } catch { return ''; }
}

/** The host provides the standard dialog wrapper, close control and focus trap. */
export function noAdsHTML(snapshot: NoAdsSnapshot, restoring = false, message = ''): string {
  const busy = restoring || snapshot.purchasing || snapshot.status === 'loading';
  const available = snapshot.status === 'ready' && !!snapshot.product && !snapshot.owned && !busy;
  const title = snapshot.owned ? 'Рекламные паузы отключены' : 'Без рекламных пауз внутри игры';
  const progress = restoring ? 'Восстанавливаем покупку…' : snapshot.purchasing ? 'Оформляем покупку…'
    : snapshot.status === 'loading' ? 'Проверяем покупку…' : '';
  const price = snapshot.product ? `<span class="no-ads-price">${escape(snapshot.product.priceValue)} ${currencyImage(snapshot.product)}<span>${escape(snapshot.product.priceCurrencyCode)}</span></span>` : '';
  const action = snapshot.owned
    ? `<button class="primary" data-action="close"${busy ? ' disabled' : ''}>Готово</button>`
    : `<button class="primary no-ads-buy" data-action="no-ads-buy"${available ? '' : ' disabled'}>${available ? `<span>Купить</span>${price}` : progress || 'Покупка пока недоступна'}</button>`;
  const restore = snapshot.owned ? '' : `<button class="quiet no-ads-restore" data-action="no-ads-restore"${busy || snapshot.status === 'local' ? ' disabled' : ''}>Восстановить покупку</button>`;
  return `<section class="no-ads-offer${snapshot.owned ? ' is-owned' : ''}" aria-labelledby="no-ads-title" aria-busy="${busy}">
    <div class="result-badge no-ads-badge" aria-hidden="true">${icon(snapshot.owned ? 'check' : 'shell')}</div>
    <h2 id="no-ads-title">${title}</h2>
    <p class="no-ads-description">${snapshot.owned ? 'Играйте без рекламных пауз и баннера внутри игры.' : 'Одна покупка убирает рекламные паузы и баннер внутри игры.'}</p>
    <div class="no-ads-details"><span aria-hidden="true">${icon('check')}</span><p>Реклама при запуске на площадке не меняется.</p></div>
    <div class="no-ads-actions">${action}${restore}</div>
    <p class="no-ads-message" role="status" aria-live="polite" aria-atomic="true">${escape(message || progress)}</p>
  </section>`;
}
