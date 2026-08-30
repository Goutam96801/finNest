# OS Notification Shade Implementation Plan

> **For agentic workers:** Inline execution in this session. Spec: `docs/superpowers/specs/2026-08-30-os-notifications-design.md`

**Goal:** After each in-app notification insert, present a styled local OS shade/banner notification (skip scheduled-reminder mirrors).

**Architecture:** New `osNotifications.ts` owns handler, Android channels, permissions, and `presentOsNotification`. `createNotification` calls it after a successful insert. Reminder schedules keep using `subscription-reminders`; mirrored rows with `data.kind === 'subscription_reminder'` do not re-present.

**Tech Stack:** Expo SDK 54, `expo-notifications` ~0.32, React Native `Platform`.

## Global Constraints

- Local present only (`trigger: null`). No Expo Push / FCM.
- Foreground: `shouldShowBanner` + `shouldShowList` always true.
- Accent `#a3e635`. Android small icon is white-on-transparent.
- Native rebuild required for custom glyph; Expo Go may show Expo’s icon.
- Shade post is best-effort; never roll back the DB insert.
- Do not commit unless the user asks.

## File map

| Path | Responsibility |
| --- | --- |
| `lib/services/osNotifications.ts` | Handler, channels, permissions, present |
| `lib/services/notifications.ts` | Call present after insert success |
| `lib/services/localReminders.ts` | Remove handler; reuse shared permissions/channels |
| `app.json` | Plugin icon → `notification-icon.png` |
| `assets/images/notification-icon.png` | White silhouette |

## Tasks

### Task 1: `osNotifications` + wire `createNotification`

- [x] Create `lib/services/osNotifications.ts`
- [x] Wire `createNotification` → `presentOsNotification`
- [x] Update `localReminders` to shared permissions/channels; lime color + subtitle on schedules

### Task 2: Icon + plugin

- [x] `assets/images/notification-icon.png` (white silhouette)
- [x] `app.json` plugin icon path

### Task 3: Verify

- [x] `tsc --noEmit` pass; no lints on touched files
- [ ] Manual on device: mark paid / low balance → shade; reminder mirror → no duplicate
