# MiForge Issue Automation Workflows

This directory contains automated workflows for managing GitHub issues using AWS Bedrock AI.

## Overview

The automation system provides:
- **Automatic Label Assignment** - AI-powered classification of issues
- **Duplicate Detection** - Semantic similarity analysis to find duplicate issues
- **Duplicate Closure** - Automatic closure of confirmed duplicates after 3 days
- **Stale Issue Management** - Closure of inactive issues after 7 days
- **Spam Detection** - AI-powered dual-pass spam comment removal
- **Duplicate Dispute Handling** - Automatic relabeling when users dispute duplicates

## Workflows

### 1. Issue Triage (`issue-triage.yml`)

**Trigger:** When a new issue is opened

**What it does:**
1. Analyzes the issue title and body using AWS Bedrock Claude
2. Assigns relevant labels from the predefined taxonomy
3. Detects potential duplicate issues
4. Posts a comment if duplicates are found
5. Adds the "duplicate" label if applicable
6. Posts AI-generated acknowledgment comment

**Required Secrets:**
- `AWS_ACCESS_KEY_ID` - AWS access key with Bedrock permissions
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key
- `AWS_REGION` (optional) - AWS region, defaults to us-east-1
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### 2. Close Duplicates (`close-duplicates.yml`)

**Trigger:** Daily at midnight UTC (or manual)

**What it does:**
1. Finds all open issues with the "duplicate" label
2. Checks how long the label has been applied
3. Checks for user disputes (comments or 👎 reactions)
4. Relabels disputed issues for maintainer review
5. Closes undisputed issues where the label has been present for 3+ days

### 3. Close Stale Issues (`close-stale.yml`)

**Trigger:** Daily at midnight UTC (or manual)

**What it does:**
1. Finds all open issues with the "pending-response" label
2. Checks the last activity date (comments or label changes)
3. Closes issues with no activity for 7+ days
4. Posts a closing comment explaining the inactivity

### 4. Duplicate Dispute Handler (`duplicate-dispute.yml`)

**Trigger:** When a comment is added to an issue

**What it does:**
1. Checks if the issue has a "duplicate" label
2. Verifies the comment was posted after the duplicate detection
3. Removes "duplicate" label and adds "pending-triage"
4. Posts an acknowledgment comment

### 5. Duplicate Reaction Check (`duplicate-reaction-check.yml`)

**Trigger:** Hourly (scheduled)

**What it does:**
1. Scans all open issues with "duplicate" label
2. Checks for 👎 reactions on duplicate detection comments
3. Relabels disputed issues for maintainer review

### 6. Delete Spam Comments (`delete-spam-comments.yml`)

**Trigger:** When a comment is created (or manual with comment ID)

**What it does:**
1. Uses AI to semantically detect spam with dual-pass confirmation
2. Skips org members automatically
3. Requires 95%+ confidence from both passes
4. Logs full audit trail for deleted comments

### 7. Issue Comment (`issue-comment.yml`)

**Trigger:** When a comment is added

**What it does:**
1. Removes "pending-response" when community member comments
2. Adds "pending-maintainer-response" for community comments
3. Removes "pending-maintainer-response" for maintainer comments

## Setup Instructions

### 1. AWS Bedrock Access

Ensure you have access to AWS Bedrock with Claude models:

1. Enable Bedrock in your AWS account
2. Request access to Claude models
3. Create an IAM user/role with Bedrock permissions

### 2. GitHub Secrets

Add the following secrets to your repository:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `AWS_ACCESS_KEY_ID` - Your AWS access key ID
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret access key
   - `AWS_ROLE_ARN` - (For spam detection) IAM role ARN
   - `AWS_REGION` (Optional) - AWS region, defaults to us-east-1

### 3. Labels

Create the following labels in your repository:

**Feature/Component Labels:**
- auth, autocomplete, chat, cli, extensions, hooks, ide, mcp, models, powers, specs, ssh, steering, sub-agents, terminal, ui, usability, trusted-commands, pricing, documentation, dependencies, compaction

**OS-Specific Labels:**
- os: linux, os: mac, os: windows

**Theme Labels:**
- theme:account, theme:agent-latency, theme:agent-quality, theme:context-limit-issue, theme:ide-performance, theme:slow-unresponsive, theme:ssh-wsl, theme:unexpected-error

**Workflow Labels:**
- pending-maintainer-response, pending-response, pending-triage, duplicate, question

**Special Labels:**
- Autonomous agent, Inline chat, on boarding

## Troubleshooting

### Common Issues

- **AWS Authentication Error** - Verify credentials in GitHub Secrets
- **No Labels Applied** - Check that labels exist in the repository
- **Duplicate Detection Not Working** - Verify Bedrock API access
- **Rate Limiting** - Workflows include built-in rate limit handling

## Support

For issues or questions:
1. Check the workflow run logs in the Actions tab
2. Review the troubleshooting section above
3. Open an issue in the repository
