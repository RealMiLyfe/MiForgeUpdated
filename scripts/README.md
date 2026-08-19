# MiForge Issue Automation Scripts

TypeScript modules for automated GitHub issue management using AWS Bedrock AI.

## Architecture

```
scripts/
├── data_models.ts          # Data structures and interfaces
├── bedrock_classifier.ts   # AWS Bedrock integration for classification
├── bedrock_comment_generator.ts # AI-generated acknowledgment comments
├── assign_labels.ts        # Label assignment logic
├── detect_duplicates.ts    # Duplicate detection using AI
├── retry_utils.ts          # Retry logic with exponential backoff
├── rate_limit_utils.ts     # GitHub API rate limit handling
├── workflow_summary.ts     # Workflow summary generation
├── triage_issue.ts         # Main triage orchestration script
├── close_duplicates.ts     # Duplicate closer script
├── close_stale.ts          # Stale issue closer script
└── delete_spam_comments.ts # AI-powered spam detection and removal
```

## Modules

### Core Data Models (`data_models.ts`)

Defines the data structures used throughout the system:

- `ClassificationResult` - AI classification output
- `DuplicateMatch` - Duplicate issue information
- `LabelTaxonomy` - Complete label taxonomy
- `IssueData` - GitHub issue data

### Bedrock Classifier (`bedrock_classifier.ts`)

Integrates with AWS Bedrock Claude for issue classification:

```typescript
async function classifyIssue(
  issueTitle: string,
  issueBody: string,
  labelTaxonomy: LabelTaxonomy
): Promise<ClassificationResult>
```

**Features:**
- Constructs prompts with label taxonomy
- Parses AI responses
- Handles errors gracefully
- Uses retry logic for reliability
- Input sanitization for prompt injection protection

### Label Assignment (`assign_labels.ts`)

Assigns labels to GitHub issues with validation:

```typescript
async function assignLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  recommendedLabels: string[],
  githubToken: string,
  taxonomy: LabelTaxonomy
): Promise<boolean>
```

**Features:**
- Validates labels against taxonomy
- Filters out invalid labels
- Always adds "pending-triage" label
- Handles GitHub API errors

### Duplicate Detection (`detect_duplicates.ts`)

Detects duplicate issues using semantic similarity:

```typescript
async function detectDuplicates(
  newTitle: string,
  newBody: string,
  owner: string,
  repo: string,
  currentIssueNumber: number,
  githubToken: string
): Promise<DuplicateMatch[]>
```

**Features:**
- Fetches existing open issues (configurable window)
- Processes in batches of 10
- Uses AI for semantic similarity
- Returns matches with score > 0.80
- Generates formatted comments

### Retry Utilities (`retry_utils.ts`)

Provides retry logic with exponential backoff:

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T>
```

**Configuration:**
- Max retries: 3
- Base delay: 1 second
- Max delay: 8 seconds
- Retryable errors: ThrottlingException, ServiceUnavailable, etc.

### Rate Limit Utilities (`rate_limit_utils.ts`)

Handles GitHub API rate limiting:

```typescript
async function checkRateLimit(client: Octokit): Promise<void>

async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  delayMs?: number
): Promise<R[]>
```

## Main Scripts

### Issue Triage (`triage_issue.ts`)

Orchestrates the complete triage process:

1. Classifies issue using Bedrock
2. Assigns labels
3. Detects duplicates
4. Posts duplicate comments
5. Adds duplicate label if needed
6. Posts AI-generated acknowledgment comments

### Close Duplicates (`close_duplicates.ts`)

Closes issues marked as duplicate for 3+ days with user response detection.

### Close Stale (`close_stale.ts`)

Closes inactive issues with "pending-response" label after 7+ days.

### Delete Spam Comments (`delete_spam_comments.ts`)

AI-powered dual-pass spam detection with confirmation for high confidence.

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Clean

```bash
npm run clean
```

### Local Testing

```bash
export ISSUE_NUMBER=123
export ISSUE_TITLE="Test issue"
export ISSUE_BODY="Test description"
export REPOSITORY_OWNER="RealMiLyfe"
export REPOSITORY_NAME="MiForgeUpdated"
export GITHUB_TOKEN="your-token"
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"

node dist/triage_issue.js
```

## Configuration

### Thresholds

| Setting | Default | File |
|---------|---------|------|
| Duplicate Closure | 3 days | `close_duplicates.ts` |
| Stale Issues | 7 days | `close_stale.ts` |
| Duplicate Similarity | 0.80 | `detect_duplicates.ts` |
| Batch Size | 10 | `detect_duplicates.ts` |
| Spam Confidence | 0.95 | `delete_spam_comments.ts` |

## Error Handling

All modules implement comprehensive error handling:

1. **Retry Logic** - Automatic retries with exponential backoff
2. **Graceful Degradation** - Continue processing on non-critical errors
3. **Detailed Logging** - Log all errors with context
4. **Fault Isolation** - Individual failures don't stop batch processing
5. **Workflow Summaries** - Track and report all errors

## Security

### Best Practices

1. **Never commit credentials** - Use environment variables
2. **Least privilege** - IAM policies grant only necessary permissions
3. **Secure secrets** - Store in GitHub Secrets
4. **Input sanitization** - All user inputs are sanitized before AI processing
5. **Prompt injection protection** - Dangerous patterns are filtered
6. **Dual-pass spam detection** - Two independent AI evaluations required

## License

See repository LICENSE file.
