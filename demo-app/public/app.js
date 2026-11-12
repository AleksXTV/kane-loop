import { toCents, formatCents, splitBill } from './split.js';

const state = { people: [], expenses: [], tip: 0 };
const $ = (id) => document.getElementById(id);

// Shareable links: ?people=Ana,Ben,Chen pre-fills the group.
const preset = new URLSearchParams(location.search).get('people');
if (preset) state.people = preset.split(',').map((s) => s.trim()).filter(Boolean);

$('person-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('person-name').value.trim();
  if (name && !state.people.includes(name)) state.people.push(name);
  $('person-name').value = '';
  render();
});

$('expense-form').addEventListener('submit', (e) => {
  e.preventDefault();
  $('expense-error').textContent = '';
  try {
    const cents = toCents($('exp-amount').value);
    if (cents === 0) throw new Error('Amount must be more than zero');
    const payer = $('exp-payer').value;
    if (!payer) throw new Error('Add people first');
    state.expenses.push({ what: $('exp-what').value.trim() || 'Expense', payer, cents });
    $('exp-what').value = '';
    $('exp-amount').value = '';
  } catch (err) {
    $('expense-error').textContent = err.message.startsWith('invalid amount') ? 'Enter an amount like 12.50' : err.message;
  }
  render();
});

$('tip').addEventListener('input', () => {
  state.tip = Math.max(0, Number($('tip').value) || 0);
  render();
});

function li(text) { const el = document.createElement('li'); el.textContent = text; return el; }

function render() {
  const n = state.people.length;
  $('people-count').textContent = n === 0 ? 'No people yet' : `${n} ${n === 1 ? 'person' : 'people'}`;
  $('people-list').replaceChildren(...state.people.map(li));

  const payer = $('exp-payer');
  const selected = payer.value;
  payer.replaceChildren(...state.people.map((p) => Object.assign(document.createElement('option'), { value: p, textContent: p })));
  if (state.people.includes(selected)) payer.value = selected;

  $('expense-list').replaceChildren(...state.expenses.map((e) => li(`${e.what}: ${formatCents(e.cents)} paid by ${e.payer}`)));

  const r = splitBill(state.people, state.expenses, state.tip);
  $('subtotal').textContent = formatCents(r.subtotal);
  $('tip-amount').textContent = formatCents(r.tip);
  $('total').textContent = formatCents(r.total);
  $('share').textContent = n ? formatCents(r.perPerson) + (r.total % n ? ' (some pay 1¢ more)' : '') : '$0.00';
  $('settlements').replaceChildren(...(r.settlements.length
    ? r.settlements.map((s) => li(`${s.from} pays ${s.to} ${formatCents(s.cents)}`))
    : [Object.assign(li('Nothing to settle'), { className: 'muted' })]));
}

render();
