/**
 * Stale Issue Handler Script
 * Closes issues with pending-response label for 7+ days without activity
 * MiForge Issue Automation
 */

import { Octokit } from "@octokit/rest";
import { retryWithBackoff } from "./retry_utils.js";

const DAYS_THRESHOLD = 7;

/**
 * Get last activity date for an issue
 */
async function getLastActivityDate(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<Date | null> {
  try {
    const { data: comments } = await client.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
      sort: "created",
      direction: "desc",
    });

    const { data: events } = await client.issues.listEvents({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    const dates: Date[] = [];

    if (comments.length > 0) {
      dates.push(new Date(comments[0].created_at));
    }

    const labelEvents = events.filter((event) => event.event === "labeled" || event.event === "unlabeled");
    if (labelEvents.length > 0) {
      dates.push(new Date(labelEvents[labelEvents.length - 1].created_at));
    }

    if (dates.length > 0) {
      return new Date(Math.max(...dates.map((d) => d.getTime())));
    }

    return null;
  } catch (error) {
    console.error(
      `Error fetching activity date for issue #${issueNumber}:`,
      error
    );
    return null;
  }
}

/**
 * Get date when pending-response label was added
 */
async function getPendingResponseLabelDate(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<Date | null> {
  try {
    const { data: events } = await client.issues.listEvents({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    const labelEvent = events
      .filter(
        (event) =>
          event.event === "labeled" &&
          "label" in event &&
          event.label &&
          event.label.name === "pending-response"
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

    return labelEvent ? new Date(labelEvent.created_at) : null;
  } catch (error) {
    console.error(
      `Error fetching label date for issue #${issueNumber}:`,
      error
    );
    return null;
  }
}

/**
 * Close stale issue with comment
 */
async function closeStaleIssue(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<boolean> {
  try {
    const comment = `This issue has been automatically closed due to inactivity. It has been 7 days since we requested additional information.

If you still need help with this issue, please feel free to reopen it or create a new issue with the requested details.`;

    await retryWithBackoff(async () => {
      await client.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment,
      });
    });

    await retryWithBackoff(async () => {
      await client.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: "closed",
      });
    });

    console.log(`✓ Closed issue #${issueNumber} due to inactivity`);
    return true;
  } catch (error) {
    console.error(`Error closing issue #${issueNumber}:`, error);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const owner = process.env.REPOSITORY_OWNER || "";
    const repo = process.env.REPOSITORY_NAME || "";
    const githubToken = process.env.GITHUB_TOKEN || "";

    if (!owner || !repo || !githubToken) {
      console.error("Missing required environment variables");
      process.exit(1);
    }

    console.log(`\n=== MiForge: Closing Stale Issues ===`);
    console.log(`Repository: ${owner}/${repo}\n`);

    const client = new Octokit({ auth: githubToken });

    const { data: issues } = await client.issues.listForRepo({
      owner,
      repo,
      state: "open",
      labels: "pending-response",
      per_page: 100,
    });

    console.log(`Found ${issues.length} open issue(s) with pending-response label`);

    if (issues.length === 0) {
      console.log("No issues to process");
      process.exit(0);
    }

    const now = new Date();
    const thresholdMs = DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
    let closedCount = 0;
    let skippedCount = 0;

    for (const issue of issues) {
      console.log(`\nProcessing issue #${issue.number}: ${issue.title}`);

      const hasPendingResponseLabel = issue.labels.some(
        (label) =>
          (typeof label === "string" ? label : label.name) === "pending-response"
      );

      if (!hasPendingResponseLabel) {
        console.log(`  Skipped: pending-response label was removed`);
        skippedCount++;
        continue;
      }

      const labelDate = await getPendingResponseLabelDate(
        client,
        owner,
        repo,
        issue.number
      );

      if (!labelDate) {
        console.log(`  Skipped: could not determine label date`);
        skippedCount++;
        continue;
      }

      const lastActivityDate = await getLastActivityDate(
        client,
        owner,
        repo,
        issue.number
      );

      const referenceDate = lastActivityDate && lastActivityDate > labelDate
        ? lastActivityDate
        : labelDate;

      const inactiveMs = now.getTime() - referenceDate.getTime();
      const inactiveDays = inactiveMs / (24 * 60 * 60 * 1000);

      console.log(`  Inactive for: ${inactiveDays.toFixed(1)} days`);

      if (inactiveMs >= thresholdMs) {
        const closed = await closeStaleIssue(
          client,
          owner,
          repo,
          issue.number
        );

        if (closed) {
          closedCount++;
        }
      } else {
        console.log(`  Skipped: not inactive long enough (needs ${DAYS_THRESHOLD} days)`);
        skippedCount++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Closed: ${closedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Total: ${issues.length}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n=== Failed ===");
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
