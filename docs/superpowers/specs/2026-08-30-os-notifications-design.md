# OS notification shade (local present) design

**Date:** 2026-08-30  
**Status:** Draft  
**Platform:** Android first; iOS uses the same present path (banner + list). Custom small icon is Android-only.  
**Approach:** Local `scheduleNotificationAsync({ trigger: null })` after each in-app insert. No Expo Push / FCM.

## Goal

When FinNest creates an in-app notification, the same event should appear in the **system notification shade** (and a heads-up banner) even if the app is already open. Shade rows should look like FinNest: lime accent, white small icon, type subtitle, readable title/body.

## Decisions

| Topic | Choice |
|-------|--------|
| Delivery | Local present only. No remote push in this change. |
| Foreground | Always show banner + shade (`shouldShowBanner` + `shouldShowList`). |
| Trigger | After a successful `createNotification` insert. |
| Duplicate reminders | Do **not** present OS for rows with `data.kind === 'subscription_reminder'` (those already fired from the 9:00 schedule). |
| Failure | Shade post is best-effort. DB insert is never rolled back. |
| Permission denied | Skip OS present for that session; in-app list still works. |
| Native rebuild | Required for the custom notification glyph. Expo Go keeps the default Expo icon. |

## Out of scope

- Remote push when the process is killed (except existing 9:00 subscription schedules)
- Custom native notification layouts (Notifee)
- Changing the in-app notifications modal UI
- iOS notification service extensions / rich attachments

## Architecture

```
createNotification (Supabase insert)
        │
        ├─ success → mapNotification
        │              └─ presentOsNotification (unless skip)
        └─ error → return as today
```

Scheduled reminders stay as they are: OS fires at 09:00 local → `SubscriptionRemindersProvider` mirrors into `createNotification` → **skip** OS present.

### Units

| Unit | Responsibility |
|------|----------------|
| `lib/services/osNotifications.ts` | Channels, permissions, copy/channel mapping, `presentOsNotification` |
| `createNotification` | Unchanged insert; on success call `presentOsNotification` |
| `localReminders.ts` | Keep 9:00 schedules + existing `subscription-reminders` channel; share channel ensure if useful |
| `app.json` `expo-notifications` plugin | Small icon + default color `#a3e635` |
| `assets/images/notification-icon.png` | White silhouette on transparent (Android status-bar / shade glyph) |

`Notifications.setNotificationHandler` lives in `osNotifications.ts` (imported from `createNotification` / app boot) so banner+list apply to every present, not only reminder schedules.

## Shade copy and channels

Accent color: `#a3e635` (plugin default + per-notification `color`).

| `AppNotification.type` | Channel id | Channel name | Subtitle | Importance |
|------------------------|------------|--------------|----------|------------|
| `subscription_due` | `activity` | Activity | Reminder | HIGH |
| `subscription_paid` | `activity` | Activity | Paid | HIGH |
| `system` | `activity` | Activity | Update | HIGH |
| `low_balance` | `money-alerts` | Money alerts | Balance | HIGH |
| (scheduled reminder content) | `subscription-reminders` | Subscription reminders | — | HIGH (existing) |

Each channel: default sound, short vibrate `[0, 250, 250, 250]`, `lightColor` `#a3e635`.

OS content: `title` and `body` from the in-app row; Android `subtitle` from the table; `channelId` from the table; `data` includes `notificationId` and `type` so tap handling can stay generic.

Tap: existing listener pushes `/(modals)/notificationsModal`. No new deep-link routes.

## Permissions

`presentOsNotification` calls the same ensure-permissions + ensure-channels path used by reminders (create all three channels on Android before posting). If status is not granted after request, return without posting.

## Icon

Android small icons are **white alpha masks**. Replace the plugin `icon` currently pointing at `./assets/images/icon.png` with `./assets/images/notification-icon.png` (white FinNest mark, transparent background, ~96×96). Do not use the full-color launcher icon in the shade.

## Verification

On a **dev/production native Android build** (not Expo Go for icon/color):

1. Mark a subscription paid → heads-up + shade row, subtitle Paid, lime accent. Tap opens the in-app list.
2. Trigger a low-balance insert → shade row, subtitle Balance, Money alerts channel.
3. Add or snooze a subscription → Activity channel row; in-app list also has the row.
4. A due reminder at 9:00 (or a scheduled test fire) → **one** shade item, not two.
5. Deny notification permission → in-app list still updates; no crash.
6. Expo Go: notification still appears, icon may be Expo’s default.

## Files expected to change

- `lib/services/osNotifications.ts` (new)
- `lib/services/notifications.ts`
- `lib/services/localReminders.ts` (handler move / channel ensure; no duplicate present)
- `app.json` (plugin icon)
- `assets/images/notification-icon.png` (new)
- `context/subscriptionRemindersContext.tsx` only if tap data needs a tiny tweak
