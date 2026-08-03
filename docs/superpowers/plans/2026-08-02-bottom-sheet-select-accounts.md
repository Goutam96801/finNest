# Bottom-sheet Select + Accounts Create/Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `@gorhom/bottom-sheet` select for account type / profile timezone+currency, and fix account create/load mapping, last4 validation, and focus refetch on Expo SDK 54.

**Architecture:** `SelectField` opens a shared `BottomSheetSelect` (`BottomSheetModal` + `BottomSheetFlatList`). Root layout provides `GestureHandlerRootView` and `BottomSheetModalProvider`. Account service maps snake_case DB rows to camelCase `Account` and filters archived rows.

**Tech Stack:** Expo SDK 54, Expo Router, NativeWind, `@gorhom/bottom-sheet` v5, Reanimated 4.1.x, Gesture Handler 2.28, Supabase JS.

## Global Constraints

- Stay on Expo SDK 54 (Play Store Expo Go on physical Android).
- Use `@gorhom/bottom-sheet` (`BottomSheetModal`), not a custom Modal sheet.
- Do not upgrade Expo for `@expo/ui` pickers.
- Do not commit unless the user explicitly asks.
- Manual verification on Expo Go Android (no unit-test harness in this repo).

---

### Task 1: Install `@gorhom/bottom-sheet` and wire root providers

**Files:**
- Modify: `package.json` / `package-lock.json` (via install)
- Modify: `app/_layout.tsx`
- Modify: `babel.config.js` (only if worklets plugin missing and install docs require it)

**Interfaces:**
- Produces: App root wrapped so any screen can present a `BottomSheetModal`.

- [ ] **Step 1: Install dependency**

```bash
npx expo install @gorhom/bottom-sheet
```

Expected: `@gorhom/bottom-sheet` ^5.x added; existing `react-native-reanimated` ~4.1.1 and `react-native-gesture-handler` ~2.28.0 remain.

- [ ] **Step 2: Update root layout**

Replace `app/_layout.tsx` with:

```tsx
import { AuthProvider } from "@/context/authContext";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "./global.css";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <AuthProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen
              name="(modals)/profileModal"
              options={{
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="(modals)/accountModal"
              options={{
                presentation: "modal",
              }}
            />
          </Stack>
        </AuthProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 3: Verify babel for Reanimated 4**

If `babel.config.js` lacks a worklets/reanimated plugin and the app crashes on sheet open, add:

```js
plugins: ["react-native-worklets/plugin"],
```

as the last plugin (project already depends on `react-native-worklets`). Restart Metro with cache clear after babel changes.

- [ ] **Step 4: Smoke-check TypeScript resolves the package**

```bash
npx tsc --noEmit
```

Expected: no new unresolved-module errors for `@gorhom/bottom-sheet`.

---

### Task 2: `SelectField` + `BottomSheetSelect` + account type constants

**Files:**
- Create: `components/SelectField.tsx`
- Create: `components/BottomSheetSelect.tsx`
- Modify: `constants/index.ts`
- Modify: `types.ts` (optional props types if preferred locally in components)

**Interfaces:**
- Produces:
  - `SelectOption = { label: string; value: string }`
  - `SelectFieldProps = { label?: string; valueLabel: string; placeholder?: string; onPress: () => void; containerClassName?: string }`
  - `BottomSheetSelect` ref: `{ present: () => void; dismiss: () => void }`
  - `BottomSheetSelectProps = { title: string; options: SelectOption[]; value?: string; onChange: (value: string) => void }`
  - `ACCOUNT_TYPE_OPTIONS: SelectOption[]`

- [ ] **Step 1: Add `ACCOUNT_TYPE_OPTIONS` to `constants/index.ts`**

Append:

```ts
export const ACCOUNT_TYPE_OPTIONS = [
  { label: "Bank", value: "bank" },
  { label: "Cash", value: "cash" },
  { label: "Wallet", value: "wallet" },
  { label: "Credit Card", value: "credit_card" },
  { label: "Investment", value: "investment" },
  { label: "Loan", value: "loan" },
  { label: "Other", value: "other" },
];
```

- [ ] **Step 2: Create `components/SelectField.tsx`**

```tsx
import Typo from "@/components/Typo";
import { CaretDown } from "phosphor-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";

type SelectFieldProps = {
  valueLabel: string;
  placeholder?: string;
  onPress: () => void;
  containerClassName?: string;
};

const SelectField = ({
  valueLabel,
  placeholder = "Select",
  onPress,
  containerClassName = "",
}: SelectFieldProps) => {
  const showPlaceholder = !valueLabel;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`w-full flex-row h-16 items-center justify-between border-[1px] border-[#d4d4d4] rounded-[17px] px-[15px] ${containerClassName}`}
    >
      <Typo color={showPlaceholder ? "#a3a3a3" : "#fff"} size={14}>
        {showPlaceholder ? placeholder : valueLabel}
      </Typo>
      <CaretDown size={18} color="#a3a3a3" />
    </TouchableOpacity>
  );
};

export default SelectField;
```

- [ ] **Step 3: Create `components/BottomSheetSelect.tsx`**

```tsx
import Typo from "@/components/Typo";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Check } from "phosphor-react-native";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type SelectOption = { label: string; value: string };

export type BottomSheetSelectHandle = {
  present: () => void;
  dismiss: () => void;
};

type BottomSheetSelectProps = {
  title: string;
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
};

const BottomSheetSelect = forwardRef<BottomSheetSelectHandle, BottomSheetSelectProps>(
  ({ title, options, value, onChange }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null);
    const insets = useSafeAreaInsets();
    const snapPoints = useMemo(() => ["45%", "70%"], []);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
      ),
      []
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#171717" }}
        handleIndicatorStyle={{ backgroundColor: "#737373" }}
      >
        <View className="px-5 pb-2">
          <Typo size={18} fontWeight="600" color="#f5f5f5">
            {title}
          </Typo>
        </View>
        <BottomSheetFlatList
          data={options}
          keyExtractor={(item) => item.value}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: 8 }}
          renderItem={({ item }) => {
            const selected = item.value === value;
            return (
              <TouchableOpacity
                onPress={() => {
                  onChange(item.value);
                  sheetRef.current?.dismiss();
                }}
                className="flex-row items-center justify-between px-4 py-3.5 rounded-xl"
                style={{ backgroundColor: selected ? "#262626" : "transparent" }}
              >
                <Typo color="#f5f5f5" size={15}>
                  {item.label}
                </Typo>
                {selected ? <Check size={20} color="#a3e635" weight="bold" /> : null}
              </TouchableOpacity>
            );
          }}
        />
      </BottomSheetModal>
    );
  }
);

BottomSheetSelect.displayName = "BottomSheetSelect";

export default BottomSheetSelect;
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: new components typecheck.

---

### Task 3: Account mapping, last4 validation, focus refetch

**Files:**
- Modify: `lib/services/accounts.ts`
- Modify: `app/(tabs)/accounts.tsx`

**Interfaces:**
- Consumes: Supabase `accounts` snake_case rows
- Produces: `mapAccountRow(row) => Account`, `getAccounts` returns mapped non-archived accounts; `createAccount` validates last4 and returns mapped `data`

- [ ] **Step 1: Rewrite `lib/services/accounts.ts` with mapping + last4**

```ts
import { ResponseType } from "@/types";
import { supabase } from "../supabase";
import { Account, AccountType } from "../types";

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  balance: number;
  color: string;
  icon: string;
  account_number_last4: string | null;
  bank_name: string | null;
  credit_limit: number | null;
  is_primary: boolean;
  is_archived: boolean;
  display_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    balance: Number(row.balance ?? 0),
    color: row.color,
    icon: row.icon,
    accountNumberLast4: row.account_number_last4,
    bankName: row.bank_name,
    creditLimit: row.credit_limit == null ? null : Number(row.credit_limit),
    isPrimary: row.is_primary,
    isArchived: row.is_archived,
    displayOrder: row.display_order,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAccounts(userId: string) {
  if (!userId) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as AccountRow[]).map(mapAccountRow);
}

export async function createAccount(userId: string, accountData: Account): Promise<ResponseType> {
  if (!userId) return { success: false, msg: "User not authenticated" };

  const allowedAccountTypes = [
    "bank",
    "cash",
    "wallet",
    "credit_card",
    "investment",
    "loan",
    "other",
  ] as const;

  const normalizeAccountType = (value?: string) => {
    const normalizedValue = value?.trim().toLowerCase();
    return allowedAccountTypes.includes(normalizedValue as (typeof allowedAccountTypes)[number])
      ? (normalizedValue as AccountType)
      : "bank";
  };

  const rawLast4 = accountData.accountNumberLast4?.trim() ?? "";
  if (rawLast4 && !/^[0-9]{4}$/.test(rawLast4)) {
    return { success: false, msg: "Last 4 digits must be exactly 4 numbers" };
  }

  const payload = {
    user_id: userId,
    name: accountData.name?.trim() || "New Account",
    type: normalizeAccountType(accountData.type),
    balance:
      typeof accountData.balance === "number" && Number.isFinite(accountData.balance)
        ? Number(accountData.balance)
        : 0,
    color: accountData.color?.trim() || "#3B82F6",
    icon: accountData.icon?.trim() || "Wallet",
    account_number_last4: rawLast4 || null,
    bank_name: accountData.bankName?.trim() || null,
    credit_limit:
      typeof accountData.creditLimit === "number" &&
      Number.isFinite(accountData.creditLimit) &&
      accountData.creditLimit >= 0
        ? Number(accountData.creditLimit)
        : null,
    is_primary: Boolean(accountData.isPrimary),
    is_archived: false,
    display_order: 0,
    notes: accountData.notes?.trim() || null,
  };

  try {
    const { data, error } = await supabase.from("accounts").insert(payload).select().single();
    if (error) return { success: false, msg: error.message };
    return {
      success: true,
      data: mapAccountRow(data as AccountRow),
      msg: "Account created successfully",
    };
  } catch (error: any) {
    return { success: false, msg: error?.message || "Unable to create account" };
  }
}
```

- [ ] **Step 2: Update `app/(tabs)/accounts.tsx` to refetch on focus**

Replace mount `useEffect` with:

```tsx
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";

// inside component:
useFocusEffect(
  useCallback(() => {
    let active = true;
    const fetchAccounts = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const data = await getAccounts(user.id);
        if (active) setAccounts(data || []);
      } catch (error) {
        console.log("Failed to load accounts", error);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAccounts();
    return () => {
      active = false;
    };
  }, [user?.id])
);
```

Also change `keyExtractor` to `(item) => item.id!` (id always present from DB).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

---

### Task 4: Wire select into account + profile modals

**Files:**
- Modify: `app/(modals)/accountModal.tsx`
- Modify: `app/(modals)/profileModal.tsx`

**Interfaces:**
- Consumes: `SelectField`, `BottomSheetSelect`, `ACCOUNT_TYPE_OPTIONS`, `TIMEZONE_OPTIONS`, `CURRENCY_OPTIONS`

- [ ] **Step 1: Update `accountModal.tsx`**

- Default `type: 'bank'` in state.
- Add refs for type sheet; render:

```tsx
import BottomSheetSelect, {
  type BottomSheetSelectHandle,
} from "@/components/BottomSheetSelect";
import SelectField from "@/components/SelectField";
import { ACCOUNT_TYPE_OPTIONS } from "@/constants";

const typeSheetRef = useRef<BottomSheetSelectHandle>(null);
const typeLabel =
  ACCOUNT_TYPE_OPTIONS.find((o) => o.value === accountData.type)?.label ?? "";

// in form, after Account Name:
<Typo color="#e5e5e5" className="mt-2">Account Type</Typo>
<SelectField
  valueLabel={typeLabel}
  placeholder="Select account type"
  onPress={() => typeSheetRef.current?.present()}
/>
<BottomSheetSelect
  ref={typeSheetRef}
  title="Account Type"
  options={ACCOUNT_TYPE_OPTIONS}
  value={accountData.type}
  onChange={(value) =>
    setAccountData((prev) => ({ ...prev, type: value as Account["type"] }))
  }
/>
```

- Before save, keep name required; last4 validation lives in `createAccount` (Alert already shows `response.msg`).
- Cap last4 input length to 4 in `onChangeText` with digits-only filter.

- [ ] **Step 2: Update `profileModal.tsx`**

Remove `@react-native-picker/picker` usage. Replace timezone/currency blocks with `SelectField` + `BottomSheetSelect` using `TIMEZONE_OPTIONS` / `CURRENCY_OPTIONS` (same pattern as account type).

- [ ] **Step 3: Typecheck + Expo Go manual checklist**

```bash
npx tsc --noEmit
```

Manual (Android Expo Go):
1. New Account → Account type sheet → select Credit Card → save.
2. Last4 `12` fails; `1234` / empty succeed.
3. Accounts list shows new account after returning.
4. Profile timezone/currency sheets work and save.

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Install gorhom + providers | Task 1 |
| SelectField + BottomSheetSelect | Task 2 |
| ACCOUNT_TYPE_OPTIONS | Task 2 |
| Account mapping + archive filter | Task 3 |
| last4 validation | Task 3 |
| useFocusEffect refetch | Task 3 |
| accountModal type select | Task 4 |
| profileModal replace Picker | Task 4 |
| Stay on SDK 54 | Global Constraints |
