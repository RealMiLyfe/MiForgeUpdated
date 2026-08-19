# Stale Issue Closing System

## Overview

MiForge's stale issue closing system automatically manages issues that have gone inactive after a response was requested from the issue author.

## How It Works

### Trigger Conditions

An issue becomes eligible for automatic closure when:

1. **Label Applied** - The `pending-response` label is added by a maintainer
2. **Time Elapsed** - 7 days have passed since the label was applied
3. **No Activity** - No comments or label changes occurred during that period

### Activity Detection

The system checks for the following types of activity:

- **Comments** - Any comment posted after the `pending-response` label was applied
- **Label Changes** - Any label additions or removals
- **The reference date** is the most recent of either the label application date or the last activity date

### Closure Process

When an issue meets closure criteria:

1. A closing comment is posted explaining the inactivity
2. The issue is closed automatically
3. The closing comment includes instructions for reopening

### Reopening

Users can:
- Reopen the issue by commenting on it
- Create a new issue with the requested information
- Contact maintainers through Discord for assistance

## Configuration

| Setting | Default | Location |
|---------|---------|----------|
| Inactivity Threshold | 7 days | `scripts/close_stale.ts` |
| Label Monitored | `pending-response` | `scripts/close_stale.ts` |
| Schedule | Daily at midnight UTC | `.github/workflows/close-stale.yml` |

## Flow Diagram

```
Issue Created
    │
    ▼
Maintainer adds "pending-response" label
    │
    ▼
Timer starts (7 days)
    │
    ├── User comments → Timer resets, label may be removed
    │
    ├── No activity for 7 days → Issue closed with comment
    │
    └── Label removed → Timer cancelled
```

## Best Practices for Maintainers

1. **Be specific** when requesting information - clearly state what's needed
2. **Set expectations** - Let users know about the auto-close timeline
3. **Review before closing** - The system handles routine cases; edge cases may need manual attention
4. **Monitor the workflow** - Check Actions tab for any failures

## Preventing False Closures

The system is designed to minimize false closures:

- Only monitors issues with the specific `pending-response` label
- Checks for ANY activity (comments, reactions, label changes)
- Uses the most recent activity date as the reference
- Provides clear instructions for reopening in the closing comment
