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
