export interface Profile {
    id?: string;
    full_name?: string;
    avatar_url?: string;
    currency?: string;
    timezone?: string;
    subscription_reminders_enabled?: boolean;
    low_balance_alerts_enabled?: boolean;
    low_balance_threshold?: number | null;
    deleted_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export type AccountType =
  | "bank"
  | "cash"
  | "wallet"
  | "credit_card"
  | "investment"
  | "loan"
  | "other";

export type Account = {
  id?: string;
  userId?: string;

  name?: string;
  type?: AccountType;

  balance?: number;

  currency?: string;

  color?: string;
  icon?: string;

  accountNumberLast4?: string | null;
  bankName?: string | null;
  creditLimit?: number | null;

  isPrimary?: boolean;
  isArchived?: boolean;

  displayOrder?: number;

  notes?: string | null;

  createdAt?: string;
  updatedAt?: string;
};