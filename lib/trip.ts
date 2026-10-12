export type Attendance = "pending" | "going" | "not-going";

export type Member = {
  id: string;
  name: string;
  role: "organizer" | "member";
  attendance: Attendance;
};

export type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  paidBy: string;
  participantIds: string[];
  date: string;
};

export type Repayment = {
  id: string;
  from: string;
  to: string;
  amount: number;
  date: string;
};

export type ScheduleItem = {
  id: string;
  time: string;
  title: string;
  owner: string;
};

export type PackingItem = {
  id: string;
  title: string;
  owner: string;
  done: boolean;
};

export type Villa = {
  address: string;
  mapUrl: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  notes: string;
};

export type TripData = {
  members: Member[];
  expenses: Expense[];
  repayments: Repayment[];
  schedule: ScheduleItem[];
  packing: PackingItem[];
  villa: Villa;
};

export type Balance = { memberId: string; amount: number };
export type SuggestedPayment = { from: string; to: string; amount: number };

export const initialTripData: TripData = {
  members: [],
  expenses: [],
  repayments: [],
  schedule: [],
  packing: [],
  villa: { address: "", mapUrl: "", phone: "", checkIn: "", checkOut: "", notes: "" },
};

export function calculateBalances(data: TripData): Balance[] {
  const balances = new Map(data.members.map((member) => [member.id, 0]));
  for (const expense of data.expenses) {
    if (!expense.participantIds.length) continue;
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amount);
    const share = Math.floor(expense.amount / expense.participantIds.length);
    const remainder = expense.amount % expense.participantIds.length;
    for (const [index, id] of expense.participantIds.entries()) {
      balances.set(id, (balances.get(id) ?? 0) - share - (index < remainder ? 1 : 0));
    }
  }
  for (const repayment of data.repayments) {
    balances.set(repayment.from, (balances.get(repayment.from) ?? 0) + repayment.amount);
    balances.set(repayment.to, (balances.get(repayment.to) ?? 0) - repayment.amount);
  }
  return [...balances].map(([memberId, amount]) => ({ memberId, amount: Math.round(amount) }));
}

export function suggestPayments(balances: Balance[]): SuggestedPayment[] {
  const debtors = balances.filter((entry) => entry.amount < 0).map((entry) => ({ id: entry.memberId, amount: -entry.amount }));
  const creditors = balances.filter((entry) => entry.amount > 0).map((entry) => ({ id: entry.memberId, amount: entry.amount }));
  const payments: SuggestedPayment[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
    if (amount > 0) payments.push({ from: debtors[debtorIndex].id, to: creditors[creditorIndex].id, amount });
    debtors[debtorIndex].amount -= amount;
    creditors[creditorIndex].amount -= amount;
    if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
    if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
  }
  return payments;
}

export function validateTripData(value: unknown): value is TripData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<TripData>;
  if (![data.members, data.expenses, data.repayments, data.schedule, data.packing].every(Array.isArray)) return false;
  if (!data.villa || typeof data.villa !== "object") return false;
  if (data.members!.length > 100 || data.expenses!.length > 500 || data.repayments!.length > 1000 || data.schedule!.length > 200 || data.packing!.length > 300) return false;
  const memberIds = new Set<string>();
  for (const member of data.members!) {
    if (!member || typeof member.id !== "string" || member.id.length > 100 || typeof member.name !== "string" || !member.name.trim() || member.name.length > 80) return false;
    if (!(["organizer", "member"] as string[]).includes(member.role) || !(["pending", "going", "not-going"] as string[]).includes(member.attendance)) return false;
    if (memberIds.has(member.id)) return false;
    memberIds.add(member.id);
  }
  for (const expense of data.expenses!) {
    if (!expense || typeof expense.id !== "string" || typeof expense.title !== "string" || !expense.title.trim() || expense.title.length > 120 || typeof expense.category !== "string" || expense.category.length > 40 || typeof expense.date !== "string" || typeof expense.amount !== "number" || !Number.isSafeInteger(expense.amount) || expense.amount <= 0 || expense.amount > 100_000_000 || !memberIds.has(expense.paidBy) || !Array.isArray(expense.participantIds) || !expense.participantIds.length || new Set(expense.participantIds).size !== expense.participantIds.length || expense.participantIds.some((id) => !memberIds.has(id))) return false;
  }
  for (const repayment of data.repayments!) {
    if (!repayment || typeof repayment.id !== "string" || !memberIds.has(repayment.from) || !memberIds.has(repayment.to) || repayment.from === repayment.to || !Number.isSafeInteger(repayment.amount) || repayment.amount <= 0 || typeof repayment.date !== "string") return false;
  }
  for (const item of [...data.schedule!, ...data.packing!]) {
    if (!item || typeof item.id !== "string" || typeof item.title !== "string" || !item.title.trim() || item.title.length > 160) return false;
  }
  if (data.schedule!.some((item) => typeof (item as ScheduleItem).time !== "string" || typeof (item as ScheduleItem).owner !== "string") || data.packing!.some((item) => typeof (item as PackingItem).owner !== "string" || typeof (item as PackingItem).done !== "boolean")) return false;
  for (const [key, item] of Object.entries(data.villa)) {
    if (typeof item !== "string" || item.length > (key === "notes" ? 1000 : 300)) return false;
  }
  return true;
}

export function formatBaht(satang: number): string {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(satang / 100);
}
