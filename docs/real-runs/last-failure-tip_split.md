# Kane caught a failure in `flows/tip_split_test.md`

- **Failing step:** 2 of 3: "Add a 10% tip"
- **Kane reason:** `assertion_failed: @ step 4` (failed action: assert: Total shows "$99.00" and Each person's share shows "$33.00".)
- **Page:** http://localhost:4173/?people=Ana,Ben,Chen
- **Run:** session `06662ea4-8eb4-4633-a81f-118a095b3131`, 32s, 3 steps replayed / 0 authored, credits 0.83

## What the step asks

```text
Set the Tip % field to 10.
Verify Total shows "$99.00" and Each person's share shows "$33.00".
```

## Expected vs seen

| Check | Expected | Seen on the page | |
|---|---|---|---|
| Total shows "$99.00". | $99.00 | $99.00 | ✓ |
| Each person's share shows "$33.00". | $33.00 | $39.00 | ❌ |

## Kane's triage (application_issue/ui_data_defect, severity major, confidence 0.99)

**Per-person share is overstated after applying a 10% tip**

With a $90.00 expense, three people, and a 10% tip, the app shows $39.00 per person instead of $33.00.

- Root cause: The total is calculated as $99.00, but the app is not dividing that total evenly among the three people when it displays each person's share.
- Suggested fix: Fix the per-person calculation so the $99.00 total is divided by all three people, producing $33.00 each.
- Signal: "Each person's share $39.00", "Verify Total shows "$99.00" and Each person's share shows "$33.00"."

## Likely culprit: the change that triggered this replay

Changed files covered by this flow: `demo-app/public/split.js`

```diff
diff --git a/demo-app/public/split.js b/demo-app/public/split.js
index 22649bd..24a0a9b 100644
--- a/demo-app/public/split.js
+++ b/demo-app/public/split.js
@@ -28,5 +28,5 @@ export function splitBill(people, expenses, tipPercent = 0) {
   // Split the subtotal and the tip separately, so a later "skip the tip" option only
   // has to touch the tip part. Leftover cents go to the first people, as before.
-  const base = Math.floor(subtotal / n) + Math.floor(tip / n);
+  const base = Math.floor(subtotal / n) + tip;
   let remainder = total - base * n;
   const shares = {};

```

## Evidence

- Screenshot at the failing step: `.kane/failure-tip_split.png`
- Evidence pack (screenshots, console, network, failure record): `.testmuai/evidence/999e16e5-ebd7-4c11-81e4-590ad225b3d9.evidence`  
  open it with `kane-cli evidence serve .testmuai/evidence/999e16e5-ebd7-4c11-81e4-590ad225b3d9.evidence`

## Next

1. Fix the application code (the recorded flow describes the intended behaviour; do not edit the `_test.md` to make it pass unless the requirement really changed).
2. Re-run: `kane-loop rerun-failed` (MCP: `rerun_failed`). Replays of unchanged steps cost 0 credits.
