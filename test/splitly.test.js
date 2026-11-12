// Unit tests of the demo app's money helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, formatCents, settle } from '../demo-app/public/split.js';

test('toCents / formatCents', () => {
  assert.equal(toCents('12.50'), 1250);
  assert.equal(toCents('$1,000'), 100000);
  assert.throws(() => toCents('abc'));
  assert.equal(formatCents(3300), '$33.00');
  assert.equal(formatCents(-5), '-$0.05');
});

test('settle pays creditors from debtors', () => {
  assert.deepEqual(settle({ Ana: 3000, Ben: 0, Chen: -3000 }), [{ from: 'Chen', to: 'Ana', cents: 3000 }]);
});

test('splitBill divides subtotal and tip between everyone (the case Kane caught)', async () => {
  const { splitBill } = await import('../demo-app/public/split.js');
  const r = splitBill(['Ana', 'Ben', 'Chen'], [{ payer: 'Ana', cents: 9000 }], 10);
  assert.equal(r.total, 9900);
  assert.equal(r.perPerson, 3300);
  assert.deepEqual(r.settlements, [{ from: 'Ben', to: 'Ana', cents: 3300 }, { from: 'Chen', to: 'Ana', cents: 3300 }]);
  const odd = splitBill(['A', 'B', 'C'], [{ payer: 'A', cents: 10000 }], 10);
  assert.equal(Object.values(odd.shares).reduce((a, b) => a + b, 0), odd.total, 'shares always add up to the total');
});
