
export interface Transaction {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  category: ExpenseCategory;
  description: string;
  type: 'DEBIT' | 'CREDIT';
}

export enum ExpenseCategory {
  FOOD = 'Food & Dining',
  SHOPPING = 'Shopping',
  TRANSPORT = 'Transport',
  BILLS = 'Utilities & Bills',
  ENTERTAINMENT = 'Entertainment',
  HEALTH = 'Health',
  TRAVEL = 'Travel',
  OTHER = 'Other',
  INCOME = 'Income'
}

export interface DashboardStats {
  totalSpent: number;
  topCategory: ExpenseCategory;
  transactionCount: number;
  avgTransaction: number;
}
