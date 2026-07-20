export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type SignupInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
};

export type LoginInput = {
  login: string;
  password: string;
};

export type DashboardStats = {
  debts: number;
  income: number;
  payments: number;
};
