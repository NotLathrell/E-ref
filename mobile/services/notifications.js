/**
 * Spoilage and near-expiry notifications.
 *
 * `planNotifications` decides what to tell the user and when. It is a pure function
 * of the enriched inventory, so it can be tested without a device. `syncNotifications`
 * applies that plan through expo-notifications: alerts that are already due are shown
 * now (at most once a day per item), and the rest are scheduled on the device, so
 * they arrive even when the app is closed.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  loadNotified,
  saveNotified,
  hasAskedForNotifications,
  markAskedForNotifications
} from './storage';

export const CHANNEL_ID = 'spoilage-alerts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Scheduled alerts are moved out of these local hours so they never wake anyone. */
const QUIET_FROM_HOUR = 22;
const QUIET_UNTIL_HOUR = 7;
const MORNING = { hour: 7, minute: 30 };

/** iOS keeps at most 64 pending local notifications. */
const MAX_SCHEDULED = 60;

function outsideQuietHours(date) {
  const hour = date.getHours();
  if (hour >= QUIET_FROM_HOUR) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    next.setHours(MORNING.hour, MORNING.minute, 0, 0);
    return next;
  }
  if (hour < QUIET_UNTIL_HOUR) {
    const same = new Date(date);
    same.setHours(MORNING.hour, MORNING.minute, 0, 0);
    return same;
  }
  return date;
}

/**
 * @param {Array<object>} items enriched inventory items
 * @param {{now?: Date, leadHours?: number}} options
 * @returns {Array<{key, kind, itemId, title, body, at: Date|null}>} `at: null` means "show now"
 */
export function planNotifications(items = [], { now = new Date(), leadHours = 24 } = {}) {
  const plan = [];

  for (const item of items) {
    const days = item.estimatedDaysLeft;
    if (item.discarded || item.frozen || days == null) continue;

    const name = item.title || 'An item';
    const action = item.recommendations?.primaryAction?.label;
    const suggestion = action ? ` Suggested: ${action}.` : '';
    const base = { itemId: item.id };

    if (days < 0) {
      plan.push({
        ...base,
        key: `${item.id}:expired`,
        kind: 'expired',
        at: null,
        title: `${name} has expired`,
        body: 'Inspect it, and discard it if it looks or smells off.'
      });
      continue;
    }

    const endsAt = new Date(now.getTime() + days * DAY);
    const critical = item.urgency === 'critical';

    if (critical) {
      plan.push({
        ...base,
        key: `${item.id}:critical`,
        kind: 'critical',
        at: null,
        title: `${name} is at high spoilage risk`,
        body: `${item.daysLabel || 'Use it soon'}.${suggestion}`
      });
    }

    const warnAt = new Date(endsAt.getTime() - leadHours * HOUR);
    if (warnAt.getTime() > now.getTime() + MINUTE) {
      const at = outsideQuietHours(warnAt);
      if (at.getTime() < endsAt.getTime()) {
        plan.push({
          ...base,
          key: `${item.id}:soon`,
          kind: 'soon',
          at,
          title: `${name} expires soon`,
          body: `About ${leadHours} hours left.${suggestion}`
        });
      }
    } else if (!critical) {
      plan.push({
        ...base,
        key: `${item.id}:soon`,
        kind: 'soon',
        at: null,
        title: `${name} expires soon`,
        body: `${item.daysLabel || 'Use it soon'}.${suggestion}`
      });
    }

    if (endsAt.getTime() > now.getTime() + MINUTE) {
      const at = outsideQuietHours(endsAt);
      if (at.getTime() <= endsAt.getTime()) {
        plan.push({
          ...base,
          key: `${item.id}:expires`,
          kind: 'expires',
          at,
          title: `${name} is about to expire`,
          body: `Use it now or freeze it if you can.`
        });
      }
    }
  }

  const due = plan.filter((entry) => entry.at === null);
  const later = plan
    .filter((entry) => entry.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);
  return [...due, ...later];
}

const dayStamp = (date) => date.toISOString().slice(0, 10);

/** Call once at start-up: how notifications look in the foreground, and the Android channel. */
export async function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false
    })
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Spoilage alerts',
      importance: Notifications.AndroidImportance.HIGH
    });
  }
}

export async function notificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** True if alerts are allowed, asking the user once if they have not been asked yet. */
export async function ensureNotificationPermission({ ask = false } = {}) {
  let status = await notificationPermission();
  if (status === 'undetermined' && ask) {
    ({ status } = await Notifications.requestPermissionsAsync());
    await markAskedForNotifications();
  }
  return status === 'granted';
}

function content(entry) {
  return { title: entry.title, body: entry.body, data: { eref: true, itemId: entry.itemId, kind: entry.kind } };
}

/**
 * Make the device's notifications match the current inventory: clear what was
 * scheduled before, show what is due, schedule what is coming.
 */
export async function syncNotifications(items, { enabled = true, leadHours = 24, now = new Date() } = {}) {
  if (Platform.OS === 'web') return { scheduled: 0, shown: 0, reason: 'unsupported' };

  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return { scheduled: 0, shown: 0, reason: 'disabled' };

  const plan = planNotifications(items, { now, leadHours });
  const firstTime = !(await hasAskedForNotifications());
  const allowed = await ensureNotificationPermission({ ask: firstTime && items.length > 0 });
  if (!allowed) return { scheduled: 0, shown: 0, reason: 'permission' };

  const notified = await loadNotified();
  const today = dayStamp(now);
  const recent = Object.fromEntries(Object.entries(notified).filter(([, day]) => day === today));
  let shown = 0;
  let scheduled = 0;

  for (const entry of plan) {
    if (entry.at === null) {
      if (recent[entry.key]) continue;
      await Notifications.scheduleNotificationAsync({ content: content(entry), trigger: null });
      recent[entry.key] = today;
      shown += 1;
    } else {
      await Notifications.scheduleNotificationAsync({
        content: content(entry),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: entry.at,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {})
        }
      });
      scheduled += 1;
    }
  }

  await saveNotified(recent);
  return { scheduled, shown, reason: null };
}

/** Lets the user confirm on their own phone that alerts are working. */
export async function sendTestNotification() {
  const allowed = await ensureNotificationPermission({ ask: true });
  if (!allowed) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'E-REF alerts are working',
      body: "You'll be told here when food is close to spoiling.",
      data: { eref: true, kind: 'test' }
    },
    trigger: null
  });
  return true;
}
