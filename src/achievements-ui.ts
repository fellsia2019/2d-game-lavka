import { campaignAchievements, finalAchievement, type Achievement } from "./achievements";
import { icon } from "./icons";
import type { Progress } from "./storage";
import { navigationState, projectSpaceName } from "./world-navigation";

const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function medal(achievement: Achievement, large = false): string {
  return `<span class="achievement-medal${large ? " achievement-medal-large" : ""}${achievement.earned ? " is-earned" : " is-pending"}" aria-hidden="true"><span class="achievement-medal-ribbon"></span><span class="achievement-medal-face">${icon(achievement.icon)}</span>${achievement.earned ? `<span class="achievement-medal-check">${icon("check")}</span>` : ""}</span>`;
}

function confetti(): string {
  return `<div class="achievement-confetti" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--piece:${i}"></i>`).join("")}</div>`;
}

function stats(achievement: Achievement): string {
  return `<dl class="achievement-stats"><div><dt>${icon("check")}Заказы</dt><dd>${achievement.ordersDone}<span> / ${achievement.ordersTotal}</span></dd></div><div><dt>${icon("home")}Обустройство</dt><dd>${achievement.tasksDone}<span> / ${achievement.tasksTotal}</span></dd></div></dl>`;
}

/** Decorative medals need no raster assets; the approved scenes remain behind the dialog. */
export function achievementModalHTML(progress: Progress, assets: string, achievementId?: string): string {
  void assets;
  const finale = finalAchievement(progress);
  const achievement = campaignAchievements(progress).find(item => item.id === achievementId) ?? finale;
  const isFinal = achievement.id === finale.id;
  const title = achievement.earned ? achievement.title : isFinal ? "Главная награда двора" : projectSpaceName(achievement.projectId!);
  const description = achievement.earned ? achievement.description : "Выполните заказы и завершите обустройство, чтобы получить эту медаль.";
  const next = achievement.projectId
    ? navigationState({ ...progress, selectedProject: achievement.projectId }).nextDestination : null;
  const actions = isFinal
    ? `<button class="primary" data-action="achievement-map">${icon("globe")}Осмотреть двор</button><button class="secondary" data-action="achievement-orders">${icon("restart")}Повторить заказы</button><button class="quiet" data-action="achievements">${icon("trophy")}Достижения</button>`
    : `${next ? `<button class="primary" data-action="continue-journey" data-project="${escape(next.projectId)}">${escape(next.actionLabel)}${icon("arrow")}</button>` : `<button class="primary" data-action="achievement-map">${icon("globe")}Осмотреть двор</button>`}<button class="quiet" data-action="${next ? "achievement-map" : "achievements"}">${icon(next ? "globe" : "trophy")}${next ? "Осмотреть двор" : "Все достижения"}</button>`;
  return `<div class="achievement-celebration${isFinal ? " achievement-finale" : ""}${achievement.earned ? " is-earned" : " is-pending"}" data-achievement="${escape(achievement.id)}">
    <div class="achievement-ceremony">${achievement.earned ? confetti() : ""}<span class="achievement-kicker">${achievement.earned ? isFinal ? "Большое достижение" : "Новое достижение" : "Впереди — новая награда"}</span>${medal(achievement, true)}<span class="achievement-ribbon-label">${achievement.earned ? "Достижение получено" : "В процессе"}</span></div>
    <h2>${escape(title)}</h2><p class="achievement-description">${escape(description)}</p>
    ${stats(achievement)}
    <div class="achievement-actions">${actions}</div>
  </div>`;
}

function albumCard(achievement: Achievement): string {
  const title = achievement.projectId ? projectSpaceName(achievement.projectId) : achievement.title;
  const body = `${medal(achievement)}<span class="achievement-card-copy"><strong>${escape(title)}</strong><span class="achievement-card-status">${achievement.earned ? `${icon("check")}Получено` : "Ещё впереди"}</span><span class="achievement-card-counts">Заказы ${achievement.ordersDone}/${achievement.ordersTotal}<br>Работы ${achievement.tasksDone}/${achievement.tasksTotal}</span></span>${achievement.earned ? icon("arrow", "achievement-card-arrow") : ""}`;
  return `<li>${achievement.earned ? `<button class="achievement-card is-earned" data-action="achievement-detail" data-achievement="${escape(achievement.id)}" aria-label="${escape(title)}. Достижение получено. Посмотреть">${body}</button>` : `<div class="achievement-card is-pending">${body}</div>`}</li>`;
}

export function achievementsHTML(progress: Progress, assets: string): string {
  void assets;
  const projects = campaignAchievements(progress).filter(achievement => !!achievement.projectId);
  const finale = finalAchievement(progress);
  const earned = projects.filter(achievement => achievement.earned).length;
  const summary = `${medal(finale)}<span class="achievement-album-summary-copy"><span class="achievement-kicker">Главная награда двора</span><strong>${escape(finale.title)}</strong><span>${finale.earned ? "Получено · посмотреть достижение" : `Достижений получено: ${earned} из ${projects.length}`}</span><span class="achievement-album-progress" aria-hidden="true"><i style="width:${projects.length ? earned / projects.length * 100 : 0}%"></i></span></span>${finale.earned ? icon("arrow") : ""}`;
  return `<div class="achievement-album"><header><span class="achievement-album-mark" aria-hidden="true">${icon("trophy")}</span><div><span class="achievement-kicker">Лавка у моря</span><h2>Ваши достижения</h2></div></header><p class="achievement-album-intro">Каждая медаль — ещё один уютный уголок у моря.</p>
    ${finale.earned ? `<button class="achievement-album-summary is-earned" data-action="achievement-detail" data-achievement="${escape(finale.id)}">${summary}</button>` : `<div class="achievement-album-summary is-pending">${summary}</div>`}
    <div class="achievement-album-heading"><h3>Коллекция двора</h3><span>${earned} / ${projects.length}</span></div>
    <ul class="achievement-grid">${projects.map(albumCard).join("")}</ul><button class="quiet achievement-album-close" data-action="close">Вернуться в игру</button>
  </div>`;
}
