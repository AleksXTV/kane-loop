---
test: ../tip_split_test.md
status: passed
started: 2026-11-12T01:52:01.998Z
duration_s: 86
session_id: 88a52c04-8378-4a60-94ac-23f9ed145cd9
---

# Splitly: even split with a tip — Result

## Add a dinner paid by Ana ✓ passed (41.6s)
md5: 608b9a71a2483b02d325235ee7490edf
Type "Dinner" into the What field, type "90" into the Amount field, choose "Ana" in Paid by, and click "Add expense".
Verify the expense list shows "Dinner: $90.00 paid by Ana".

## Add a 10% tip ✓ passed (22.6s)
md5: ab0c290d0b6143ffa67b30d4a065c660
Set the Tip % field to 10.
Verify Total shows "$99.00" and Each person's share shows "$33.00".

## Check the settle-up ✓ passed (17.9s)
md5: d8dd378e21d94808c7a9173f5a1b8866
Verify the Settle up list shows "Ben pays Ana $33.00" and "Chen pays Ana $33.00".
