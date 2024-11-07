import axios from 'axios';
import * as dotenv from 'dotenv';
import { Commit, PullRequest, ReleaseResponse, TagAndReleaseNames, ChatGPTResponse, AxiosError } from './types';


dotenv.config();

const githubToken = process.env.API_GITHUB_TOKEN as string;
const openaiToken = process.env.OPENAI_API_KEY as string;

// GitHub organization and repositories
const org = 'rainlanguage';
const repos = [
  'rain.interpreter',
  'rain.interpreter.interface',
  'rain.orderbook.interface',
  'rain.math.float',
  'rain.flare'
];

// Report repository details
const reportOwner = 'Siddharth2207';
const reportRepo = 'rainlanguage-releases';
const reportRepoBase = `https://api.github.com/repos/${reportOwner}/${reportRepo}`;


// Function to start the release process for all repositories
async function startReleaseProcess(): Promise<void> {
  let aggregateReport = '';

  for (const repo of repos) {
    const repoApiBase = `https://api.github.com/repos/${org}/${repo}`;
    const report = await fetchLatestMainCommit(org, repo, repoApiBase);
    if (report) {
      aggregateReport += `## ${repo}\n${report}\n\n`;
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

// Function to fetch the latest commit on the main branch
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
      return await generateReportForPR(pr, apiBase);
    } else {
      console.log(`Latest commit in ${repo} is not associated with any PR.`);
      return await generateCommitReport(latestCommit);
    }
  } catch (error) {
    console.error(`Error fetching latest commit for ${repo}:`, (error as Error).message);
  }
}

// Function to find PR for a given commit SHA
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

// Function to generate a report for a given PR, including commit messages and diff summary
async function generateReportForPR(pr: PullRequest, apiBase: string): Promise<string | void> {
  try {
    const { data: commits } = await axios.get<Commit[]>(`${apiBase}/pulls/${pr.number}/commits`, {
      headers: { Authorization: `token ${githubToken}` },
    });

    const commitMessages = commits.map(commit => `- ${commit.commit.message}`).join('\n');
    const diff = await fetchDiffForPR(pr.number, apiBase);
    const diffSummary = await analyzeDiffWithChatGPT(diff);

    return `
### PR #${pr.number} - ${pr.title}
- **Author**: ${pr.user.login}
- **Merged At**: ${pr.merged_at}

#### Commit Messages
${commitMessages}

#### Code Diff Summary
${diffSummary}
    `;
  } catch (error) {
    console.error(`Error generating report for PR #${pr.number}:`, (error as Error).message);
  }
}

// Function to fetch the code diff for a PR
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

// Function to send the diff to ChatGPT API and get a summary
async function analyzeDiffWithChatGPT(diff: string): Promise<string> {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a code review assistant. Summarize the code diffs provided, highlighting key changes, optimizations, and potential issues.",
          },
          {
            role: "user",
            content: `Here is the code diff:\n\n${diff}`,
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
    console.error('Error analyzing diff with ChatGPT:', (error as Error).message);
    return 'Diff analysis could not be generated.';
  }
}

// Function to generate a report for a standalone commit
async function generateCommitReport(commit: Commit): Promise<string> {
  return `
### Commit ${commit.sha}
- **Author**: ${commit.commit.author.name} (${commit.commit.author.email})
- **Date**: ${commit.commit.author.date}
- **Commit Message**: ${commit.commit.message}
  `;
}

// Function to create a draft release with the aggregated report and return its ID
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

// Function to publish a draft release by setting draft: false
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

// Execute the release process for all repositories
startReleaseProcess();
