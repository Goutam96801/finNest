# Notification detail bottom sheet design

**Date:** 2026-08-03  
**Status:** Implemented

## Goal

Notifications list: check icon marks all read. Tapping a row opens a bottom sheet with details; `subscription_due` also offers **Mark paid / Snooze / Skip**.

## Behavior

- Header right: Phosphor `Check` → `markAllNotificationsRead`
- Tap row → present sheet; mark that notification read on open
- Sheet always shows title, body, relative/absolute time
- If `type === 'subscription_due'` and `data.subscriptionId`: fetch subscription; show name, amount, due date; three action buttons wired to existing subscription services
- Other types: details only (dismiss via backdrop / pan)

## Out of scope

- Deep link routing, edit subscription from sheet
