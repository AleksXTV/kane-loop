---
mode: testing
url: http://localhost:4173/?people=Ana,Ben,Chen
tags: [split, tip]
max_steps: 15
---

# Splitly: even split with a tip

<!-- kane-loop covers: demo-app/public/split.js demo-app/public/app.js demo-app/public/index.html -->

## Add a dinner paid by Ana
Type "Dinner" into the What field, type "90" into the Amount field, choose "Ana" in Paid by, and click "Add expense".
Verify the expense list shows "Dinner: $90.00 paid by Ana".

## Add a 10% tip
Set the Tip % field to 10.
Verify Total shows "$99.00" and Each person's share shows "$33.00".

## Check the settle-up
Verify the Settle up list shows "Ben pays Ana $33.00" and "Chen pays Ana $33.00".
