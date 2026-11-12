---
mode: testing
url: http://localhost:4173/?people=Ana,Ben,Chen
tags: [split, settle]
max_steps: 15
---

# Splitly: settle up after two payers

<!-- kane-loop covers: demo-app/public/split.js demo-app/public/app.js demo-app/public/index.html -->

## Add a dinner paid by Ana
Type "Dinner" into the What field, type "60" into the Amount field, choose "Ana" in Paid by, and click "Add expense".
Verify the expense list shows "Dinner: $60.00 paid by Ana".

## Add a taxi paid by Ben
Type "Taxi" into the What field, type "30" into the Amount field, choose "Ben" in Paid by, and click "Add expense".
Verify Total shows "$90.00" and Each person's share shows "$30.00".

## Check who pays whom
Verify the Settle up list shows exactly one line: "Chen pays Ana $30.00".
