# Stale Issue Timeline Examples

Visual examples showing how the MiForge stale issue closing system handles different scenarios.

---

## Example 1: Standard Closure (No Response)

```
Day 0  │ Issue #42 opened by user
       │ Labels: [pending-triage]
       │
Day 1  │ Maintainer reviews, asks for more info
       │ Labels: [pending-response]
       │ ← Timer starts
       │
Day 2  │ (no activity)
Day 3  │ (no activity)
Day 4  │ (no activity)
Day 5  │ (no activity)
Day 6  │ (no activity)
Day 7  │ (no activity)
       │
Day 8  │ ⚡ Workflow runs at midnight
       │ → Days since label: 7+ ✓
       │ → Last activity: Day 1 (label added)
       │ → CLOSED with comment
       │ Status: CLOSED
```

**Result:** Issue automatically closed after 7 days of inactivity.

---

## Example 2: User Responds (Timer Reset)

```
Day 0  │ Issue #55 opened by user
       │ Labels: [pending-triage]
       │
Day 1  │ Maintainer asks for reproduction steps
       │ Labels: [pending-response]
       │ ← Timer starts
       │
Day 4  │ User posts reproduction steps
       │ ← Activity detected! Reference date updated
       │
Day 8  │ ⚡ Workflow runs at midnight
       │ → Days since label: 7+ ✓
       │ → Last activity: Day 4 (comment)
       │ → Days since last activity: 4 ✗ (< 7)
       │ → SKIPPED
       │
Day 11 │ (no activity since Day 4)
       │
Day 12 │ ⚡ Workflow runs at midnight
       │ → Days since last activity: 8 ✓ (> 7)
       │ → CLOSED with comment
       │ Status: CLOSED
```

**Result:** Timer effectively reset when user commented. Closed 7 days after last activity.

---

## Example 3: Label Removed (Cancelled)

```
Day 0  │ Issue #78 opened by user
       │ Labels: [pending-triage]
       │
Day 1  │ Maintainer asks for logs
       │ Labels: [pending-response]
       │ ← Timer starts
       │
Day 3  │ Maintainer finds the issue themselves
       │ Labels: [bug, ide] (pending-response removed)
       │ ← Timer cancelled
       │
Day 8  │ ⚡ Workflow runs at midnight
       │ → Issue does NOT have pending-response label
       │ → SKIPPED (not in scope)
       │ Status: OPEN
```

**Result:** Removing the label takes the issue out of scope entirely.

---

## Example 4: Maintainer Comments (Activity Detected)

```
Day 0  │ Issue #91 opened by user
       │ Labels: [pending-triage]
       │
Day 1  │ Maintainer asks for version info
       │ Labels: [pending-response]
       │ ← Timer starts
       │
Day 5  │ Another maintainer adds context
       │ ← Activity detected!
       │
Day 8  │ ⚡ Workflow runs at midnight
       │ → Days since last activity: 3 ✗ (< 7)
       │ → SKIPPED
       │ Status: OPEN
```

**Result:** Any comment (even from maintainers) counts as activity.

---

## Example 5: Duplicate with Pending Response

```
Day 0  │ Issue #103 opened by user
       │ Labels: [pending-triage]
       │
Day 1  │ AI detects duplicate
       │ Labels: [duplicate]
       │
Day 1  │ Maintainer also adds pending-response
       │ Labels: [duplicate, pending-response]
       │ ← Both timers start
       │
Day 4  │ ⚡ Duplicate closer runs
       │ → duplicate label age: 3 days ✓
       │ → CLOSED as duplicate
       │ Status: CLOSED
```

**Result:** The duplicate closer runs first (3-day threshold vs 7-day), so the issue is closed as duplicate before the stale timer expires.

---

## Summary Table

| Scenario | Threshold | Outcome |
|----------|-----------|---------|
| No response | 7 days after label | Closed |
| User responds | 7 days after last activity | Closed (if still pending) |
| Label removed | N/A | Not eligible |
| Any comment | Resets reference date | Extended |
| Also marked duplicate | 3 days (duplicate) | Closed as duplicate first |

---

## Key Takeaways

1. **Activity resets the clock** - Any interaction extends the window
2. **Label presence is required** - No `pending-response` label = not eligible
3. **Duplicate takes priority** - 3-day threshold fires before 7-day stale threshold
4. **Users are informed** - Closing comments explain how to reopen
