// Pure bill-splitting logic. All money is handled in integer cents.

/** @param {string|number} value dollars as typed by the user, e.g. "12.50" */
export function toCents(value) {
  const n = Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid amount: ${value}`);
  return Math.round(n * 100);
}

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Split expenses evenly between people, with an optional tip on top.
 * @param {string[]} people
 * @param {{payer: string, cents: number}[]} expenses
 * @param {number} tipPercent e.g. 10 for 10%
 */
export function splitBill(people, expenses, tipPercent = 0) {
  const n = people.length;
  const subtotal = expenses.reduce((sum, e) => sum + e.cents, 0);
  const tip = Math.round((subtotal * tipPercent) / 100);
  const total = subtotal + tip;
  if (n === 0) return { subtotal, tip, total, perPerson: 0, shares: {}, balances: {}, settlements: [] };

  // Even shares; the first people absorb leftover cents so shares always add up to total.
  const base = Math.floor(total / n);
  let remainder = total - base * n;
  const shares = {};
  for (const p of people) {
    shares[p] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }

  // The tip is paid by whoever paid the expenses, in proportion to what they paid.
  const paid = Object.fromEntries(people.map((p) => [p, 0]));
  for (const e of expenses) {
    const withTip = subtotal === 0 ? 0 : e.cents + Math.round((tip * e.cents) / subtotal);
    paid[e.payer] = (paid[e.payer] || 0) + withTip;
  }
  const balances = Object.fromEntries(people.map((p) => [p, paid[p] - shares[p]]));
  return { subtotal, tip, total, perPerson: base, shares, balances, settlements: settle(balances) };
}

/** Greedy settle-up: who pays whom so that every balance goes to zero. */
export function settle(balances) {
  const debtors = Object.entries(balances).filter(([, b]) => b < 0).map(([name, b]) => ({ name, amount: -b }));
  const creditors = Object.entries(balances).filter(([, b]) => b > 0).map(([name, b]) => ({ name, amount: b }));
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) out.push({ from: debtors[i].name, to: creditors[j].name, cents: amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return out;
}
