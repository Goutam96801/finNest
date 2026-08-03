import { CategoryType, ExpenseCategoriesType } from "@/types";
import * as Icons from "phosphor-react-native";

/** Matches public.transaction_type enum (UI currently uses expense/income) */
export const transactionTypes = [
  { label: "Expense", value: "expense" as const },
  { label: "Income", value: "income" as const },
  { label: "Transfer", value: "transfer" as const },
];

/** Matches public.category_type enum */
export const categoryTypes = [
  { label: "Expense", value: "expense" as const },
  { label: "Income", value: "income" as const },
];

/** Matches public.transaction_status enum */
export const transactionStatuses = [
  { label: "Completed", value: "completed" as const },
  { label: "Pending", value: "pending" as const },
  { label: "Cancelled", value: "cancelled" as const },
];

export const expenseCategories: ExpenseCategoriesType = {
  groceries: {
    label: "Groceries",
    value: "groceries",
    icon: Icons.ShoppingCart,
    bgColor: "#4B5563",
  },
  rent: {
    label: "Rent",
    value: "rent",
    icon: Icons.House,
    bgColor: "#075985",
  },
  utilities: {
    label: "Utilities",
    value: "utilities",
    icon: Icons.Lightbulb,
    bgColor: "#ca8a04",
  },
  transportation: {
    label: "Transportation",
    value: "transportation",
    icon: Icons.Car,
    bgColor: "#b45309",
  },
  entertainment: {
    label: "Entertainment",
    value: "entertainment",
    icon: Icons.FilmStrip,
    bgColor: "#0f766e",
  },
  dining: {
    label: "Dining",
    value: "dining",
    icon: Icons.ForkKnife,
    bgColor: "#be185d",
  },
  health: {
    label: "Health",
    value: "health",
    icon: Icons.Heart,
    bgColor: "#e11d48",
  },
  insurance: {
    label: "Insurance",
    value: "insurance",
    icon: Icons.ShieldCheck,
    bgColor: "#404040",
  },
  savings: {
    label: "Savings",
    value: "savings",
    icon: Icons.PiggyBank,
    bgColor: "#065F46",
  },
  clothing: {
    label: "Clothing",
    value: "clothing",
    icon: Icons.TShirt,
    bgColor: "#7c3aed",
  },
  personal: {
    label: "Personal",
    value: "personal",
    icon: Icons.User,
    bgColor: "#a21caf",
  },
  others: {
    label: "Others",
    value: "others",
    icon: Icons.DotsThreeOutline,
    bgColor: "#525252",
  },
};

export const incomeCategory: CategoryType = {
  label: "Income",
  value: "income",
  icon: Icons.CurrencyDollarSimple,
  bgColor: "#16a34a",
};

export const getCategoryByValue = (value?: string | null): CategoryType => {
  if (!value) return expenseCategories.others;
  if (value === incomeCategory.value) return incomeCategory;
  return expenseCategories[value] ?? expenseCategories.others;
};
