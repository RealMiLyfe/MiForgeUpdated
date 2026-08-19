# Implementation Plan: MiForge GitHub Issue Automation

## Overview

This implementation plan breaks down the MiForge GitHub issue automation system into discrete, manageable tasks. The system is built using TypeScript with AWS Bedrock AI integration for intelligent issue management.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Create `scripts/` directory for TypeScript modules
  - Create `package.json` with dependencies
  - Create `tsconfig.json` for TypeScript configuration
  - Set up Node.js environment configuration
  - _Requirements: 5.1, 5.2_

- [x] 2. Implement core data models
  - Create data models module (`data_models.ts`)
  - Implement `ClassificationResult` interface
  - Implement `DuplicateMatch` interface
  - Implement `LabelTaxonomy` class with all label categories
  - Implement `IssueData` interface
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Implement Bedrock Classifier module
  - Create Bedrock integration (`bedrock_classifier.ts`)
  - Implement AWS Bedrock client initialization
  - Implement prompt construction with label taxonomy
  - Implement input sanitization for prompt injection protection
  - Implement response parsing to ClassificationResult
  - Add retry logic with exponential backoff
  - Add error handling and logging
  - _Requirements: 1.1, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 4. Implement Label Assignment module
  - Create label assignment logic (`assign_labels.ts`)
  - Implement label validation against taxonomy (max 3 labels)
  - Implement GitHub API integration for adding labels
  - Always add "pending-triage" label
  - Add duplicate label management
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 6.6_

- [x] 5. Implement Duplicate Detection module
  - Create duplicate detection logic (`detect_duplicates.ts`)
  - Implement fetch of existing open issues with filtering
  - Implement Bedrock-based semantic similarity analysis
  - Process issues in batches of 10
  - Return matches with similarity > 0.80
  - Implement duplicate comment generation
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6. Implement Comment Generator module
  - Create AI-powered comment generator (`bedrock_comment_generator.ts`)
  - Implement model fallback chain (Opus 4.6 → Opus 4.5)
  - Include existing comments context
  - Implement fallback static comment
  - _Requirements: Related to user experience_

- [x] 7. Implement Issue Triage orchestration
  - Create main triage script (`triage_issue.ts`)
  - Orchestrate: duplicate detection → classification → labels → comment
  - Implement workflow summary generation
  - Handle all error paths gracefully
  - _Requirements: 7.1, 8.1, 8.2, 8.4, 8.5_

- [x] 8. Implement Duplicate Closer
  - Create duplicate closer script (`close_duplicates.ts`)
  - Query issues with "duplicate" label
  - Check label age (3+ days threshold)
  - Detect user disputes (comments, 👎 reactions)
  - Relabel disputed issues for review
  - Close undisputed duplicates with comment
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 9. Implement Stale Issue Handler
  - Create stale issue handler (`close_stale.ts`)
  - Query issues with "pending-response" label
  - Check last activity date
  - Close issues inactive for 7+ days
  - Post closing comment with reopen instructions
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 10. Implement Spam Detection
  - Create spam detection script (`delete_spam_comments.ts`)
  - Implement dual-pass AI verification
  - Require 95%+ confidence from both passes
  - Implement org member bypass
  - Add full audit logging
  - _Requirements: Security enhancement_

- [x] 11. Implement utility modules
  - Create retry utilities (`retry_utils.ts`)
  - Create rate limit utilities (`rate_limit_utils.ts`)
  - Create workflow summary utilities (`workflow_summary.ts`)
  - _Requirements: 5.3, 7.4, 7.5, 8.3_

- [x] 12. Create GitHub Actions workflows
  - Issue triage workflow (`issue-triage.yml`)
  - Close duplicates workflow (`close-duplicates.yml`)
  - Close stale issues workflow (`close-stale.yml`)
  - Duplicate dispute handler (`duplicate-dispute.yml`)
  - Duplicate reaction check (`duplicate-reaction-check.yml`)
  - Delete spam comments (`delete-spam-comments.yml`)
  - Issue comment handler (`issue-comment.yml`)
  - Manual duplicate scanner (`duplicates.yml`)
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 13. Create issue templates and configuration
  - Bug report template
  - Feature request template
  - Template configuration with external links
  - CODEOWNERS file
  - _Requirements: User experience_

- [x] 14. Create documentation
  - Main README with project overview
  - Scripts README with API documentation
  - Workflows README with setup instructions
  - Stale issue documentation with timeline examples
  - Contributing guidelines
  - _Requirements: Documentation_

- [ ] 15. Testing and validation
  - Write unit tests for data models
  - Write property tests for core modules
  - Run integration tests against test repository
  - Validate all workflows end-to-end
  - _Requirements: All_

## Notes

- All TypeScript code uses strict mode with comprehensive type annotations
- AWS credentials are stored in GitHub Secrets, never in code
- Input sanitization protects against prompt injection attacks
- Dual-pass spam detection minimizes false positives
- Fault isolation ensures individual failures don't stop batch processing
