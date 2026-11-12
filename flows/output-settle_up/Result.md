---
test: ../settle_up_test.md
status: passed
started: 2026-11-12T02:00:47.565Z
duration_s: 97
session_id: 5362b5c3-62bf-40d6-86cc-a3fccaa32def
---

# Splitly: settle up after two payers — Result

## Add a dinner paid by Ana ✓ passed (40.4s)
md5: 158afb280093414a5fa067fb272e6d69
Type "Dinner" into the What field, type "60" into the Amount field, choose "Ana" in Paid by, and click "Add expense".
Verify the expense list shows "Dinner: $60.00 paid by Ana".

## Add a taxi paid by Ben ✓ passed (35.2s)
md5: 51f23c8602028febc5ca0c3b30f0fa15
Type "Taxi" into the What field, type "30" into the Amount field, choose "Ben" in Paid by, and click "Add expense".
Verify Total shows "$90.00" and Each person's share shows "$30.00".

## Check who pays whom ✓ passed (16.9s)
md5: caa2230058654c67381daf905dd497d6
Verify the Settle up list shows exactly one line: "Chen pays Ana $30.00".
