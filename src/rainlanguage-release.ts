import axios from 'axios';
import * as dotenv from 'dotenv';
import { Commit, PullRequest, ReleaseResponse, ChatGPTResponse } from './types';

dotenv.config();

const githubToken = process.env.API_GITHUB_TOKEN as string;
const openaiToken = process.env.OPENAI_API_KEY as string;

const org = 'rainlanguage';
const repos = [
  'rain.interpreter',
  'rain.interpreter.interface',
  'rain.orderbook.interface',
  'rain.math.float',
  'rain.flare',
  'rain.orderbook', 
  'rain.webapp'
];

const reportOwner = 'Siddharth2207';
const reportRepo = 'rainlanguage-releases';
const reportRepoBase = `https://api.github.com/repos/${reportOwner}/${reportRepo}`;

async function startReleaseProcess(): Promise<void> {
  let aggregateReport = '';

  for (const repo of repos) {
    const repoApiBase = `https://api.github.com/repos/${org}/${repo}`;
    const report = await fetchLatestMainCommit(org, repo, repoApiBase);
    if (report) {
      aggregateReport += `**## ${repo}**\n${report}\n\n`;
    }
  }

  if (aggregateReport) {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const uniqueTagName = `${org}-aggregated-${timestamp}`;
    const releaseName = `Aggregated Release - ${org} - ${new Date().toLocaleString()}`;
    const releaseId = await createDraftRelease(uniqueTagName, releaseName, aggregateReport);
    if (releaseId) {
      await publishDraftRelease(releaseId);
    }
  } else {
    console.log('No updates found across the repositories.');
  }
}

async function fetchLatestMainCommit(owner: string, repo: string, apiBase: string): Promise<string | void> {
  try {
    const { data: commits } = await axios.get<Commit[]>(`${apiBase}/commits`, {
      headers: { Authorization: `token ${githubToken}` },
      params: { sha: 'main', per_page: 1 },
    });

    const latestCommit = commits[0];
    console.log(`Fetching report for latest commit in ${repo}: ${latestCommit.sha}`);

    const pr = await findPRForCommit(latestCommit.sha, apiBase);
    if (pr) {
      console.log(`Latest commit in ${repo} is associated with PR #${pr.number}`);
      return await generateReportForPR(pr, apiBase, repo);
    } else {
      console.log(`Latest commit in ${repo} is not associated with any PR.`);
      return await generateCommitReport(latestCommit);
    }
  } catch (error) {
    console.error(`Error fetching latest commit for ${repo}:`, (error as Error).message);
  }
}

async function findPRForCommit(commitSha: string, apiBase: string): Promise<PullRequest | null> {
  try {
    const { data: prs } = await axios.get<PullRequest[]>(`${apiBase}/commits/${commitSha}/pulls`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.groot-preview+json',
      },
    });
    return prs.length > 0 ? prs[0] : null;
  } catch (error) {
    console.error('Error checking PR for commit:', (error as Error).message);
    return null;
  }
}

async function generateReportForPR(pr: PullRequest, apiBase: string, repo: string): Promise<string | void> {
  try {
    const { data: commits } = await axios.get<Commit[]>(`${apiBase}/pulls/${pr.number}/commits`, {
      headers: { Authorization: `token ${githubToken}` },
    });

    const commitMessages = commits.map(commit => `- ${commit.commit.message}`).join('\n');
    const diff = await fetchDiffForPR(pr.number, apiBase);

    // Generate release notes and remove any unintended markdown quote formatting
    const releaseNotes = (await generateReleaseNotes(pr.body, diff)).replace(/^`{3}markdown|`{3}$/g, '');

    // Extract issue link if present in the PR body
    const issueMatch = pr.body?.match(/#(\d+)/);
    const issueNumber = issueMatch ? issueMatch[1] : null;
    const issueLink = issueNumber ? `https://github.com/${org}/${repo}/issues/${issueNumber}` : null;
    const issueSection = issueLink ? `See issue: [#${issueNumber}](${issueLink})` : 'No linked issue.';

    return `
### Overview
${releaseNotes}

---

### 📜 Full PR Description
${issueSection}

## Solution
${pr.body?.replace(/## Checks[\s\S]*/g, '') || 'No solution provided.'}

---

### 📄 Detailed Commit Messages
${commitMessages}
    `;
  } catch (error) {
    console.error(`Error generating report for PR #${pr.number}:`, (error as Error).message);
  }
}

async function fetchDiffForPR(prNumber: number, apiBase: string): Promise<string> {
  try {
    const { data } = await axios.get<string>(`${apiBase}/pulls/${prNumber}`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3.diff',
      },
    });
    return data;
  } catch (error) {
    console.error(`Error fetching diff for PR #${prNumber}:`, (error as Error).message);
    return '';
  }
}

async function generateReleaseNotes(prBody: string | null, diff: string): Promise<string> {
  try {
    const response = await axios.post<ChatGPTResponse>(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert release notes generator. Based on the provided PR summary and code diff, generate a clear, human-readable release note with the following sections:
            
            - "Overview" (a concise summary of the main changes)
            - "🎯 Highlights" (key improvements or features)
            - "🏗️ Architecture Changes" (technical updates to the system architecture)
            - "🧪 Tests" (details on tests added or updates in testing)
            
            If a section is not relevant, write "No information available." Ensure the response is in markdown format with each section starting with a header (###).`,
          },
          {
            role: "user",
            content: `PR Summary:\n\n${prBody || 'No summary provided.'}\n\nCode Diff:\n\n${diff}`,
          },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content.trim();

  } catch (error) {
    console.error('Error generating release notes with ChatGPT:', (error as Error).message);
    return `
### Overview
No information available.

### 🎯 Highlights
No information available.

### 🏗️ Architecture Changes
No information available.

### 🧪 Tests
No information available.
    `;
  }
}

async function generateCommitReport(commit: Commit): Promise<string> {
  return `
### Commit ${commit.sha}
- **Author**: ${commit.commit.author.name} (${commit.commit.author.email})
- **Date**: ${commit.commit.author.date}
- **Commit Message**: ${commit.commit.message}
  `;
}

async function createDraftRelease(tagName: string, releaseName: string, body: string): Promise<number | void> {
  try {
    const { data: release } = await axios.post<ReleaseResponse>(`${reportRepoBase}/releases`, {
      tag_name: tagName,
      name: releaseName,
      body: body,
      draft: true,
    }, {
      headers: { Authorization: `token ${githubToken}` },
    });

    console.log(`Draft release created with tag: ${tagName}`);
    return release.id;
  } catch (error) {
    console.error('Error creating draft release:', (error as Error).message);
  }
}

async function publishDraftRelease(releaseId: number): Promise<void> {
  try {
    await axios.patch(`${reportRepoBase}/releases/${releaseId}`, {
      draft: false,
    }, {
      headers: { Authorization: `token ${githubToken}` },
    });

    console.log(`Draft release with ID ${releaseId} has been published.`);
  } catch (error) {
    console.error(`Error publishing draft release:`, (error as Error).message);
  }
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  return `${diffInHours} hours ago`;
}

startReleaseProcess();
  