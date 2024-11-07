import axios from 'axios';
import * as dotenv from 'dotenv';
import { Commit, PullRequest, ReleaseResponse, TagAndReleaseNames, ChatGPTResponse, AxiosError } from './types';


dotenv.config();

const githubToken = process.env.API_GITHUB_TOKEN as string;
const openaiToken = process.env.OPENAI_API_KEY as string;
const owner = 'rainlanguage';
const repos = ['rain.orderbook']; // Add additional repos as needed
const reportOwner = 'Siddharth2207';
const reportRepo = `raindex-releases`;
const reportRepoBase = `https://api.github.com/repos/${reportOwner}/${reportRepo}`;


// Utility function to generate tagName and releaseName based on repository
function getTagAndReleaseNames(repo: string, commitSha: string): { tagName: string; releaseName: string } {
  if (repo === 'rain.orderbook') {
    return {
      tagName: `app-v0.0.0-${commitSha}`,
      releaseName: `App v0.0.0-${commitSha}`,
    };
  } else if (repo === 'rain.webapp') {
    return {
      tagName: `webapp-v0.0.0-${commitSha}`,
      releaseName: `RaindexWebApp v0.0.0-${commitSha}`,
    };
  }
  return {
    tagName: `release-v0.0.0-${commitSha}`,
    releaseName: `Release v0.0.0-${commitSha}`,
  };
}

// Start release process for each repository
async function startReleaseProcess(): Promise<void> {
  for (const repo of repos) {
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
    console.log(`Processing repository: ${repo}`);
    await fetchLatestMainCommit(apiBase, repo);
  }
}

// Fetch the latest commit on the main branch for a specific repository
async function fetchLatestMainCommit(apiBase: string, repo: string): Promise<void> {
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
      await generateReportForPR(pr, repo, latestCommit.sha);
    } else {
      console.log(`Latest commit in ${repo} is not associated with any PR.`);
      await generateCommitReport(repo, latestCommit);
    }
  } catch (error) {
    console.error(`Error fetching latest commit for ${repo}:`, (error as Error).message);
  }
}

// Find PR for a given commit SHA
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

// Generate a report for a PR, including commit messages and code diff analysis
async function generateReportForPR(pr: PullRequest, repo: string, commitSha: string): Promise<void> {
  try {
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
    const { data: commits } = await axios.get<Commit[]>(`${apiBase}/pulls/${pr.number}/commits`, {
      headers: { Authorization: `token ${githubToken}` },
    });

    const { tagName, releaseName } = getTagAndReleaseNames(repo, commitSha);
    const existingRelease = await findReleaseByTag(tagName);

    if (existingRelease) {
      console.log(`Release for PR #${pr.number} with tag ${tagName} already exists. Skipping...`);
      return;
    }

    const commitMessages = commits.map(commit => `- ${commit.commit.message}`).join('\n');
    const diff = await fetchDiffForPR(pr.number, apiBase);
    const diffSummary = await analyzeDiffWithChatGPT(diff);

    const report = `
## Report for PR #${pr.number}

### Title
${pr.title}

### Author
${pr.user.login}

### Merged At
${pr.merged_at}

### Summary
${pr.body || 'No description provided.'}

## Commits
${commitMessages}

## Code Diff Summary
${diffSummary}
    `;

    console.log(report);

    await createRelease(tagName, releaseName, report);
  } catch (error) {
    console.error(`Error generating report for PR #${pr.number}:`, (error as Error).message);
  }
}

// Fetch the code diff for a PR
async function fetchDiffForPR(prNumber: number, apiBase: string): Promise<string> {
  try {
    const { data } = await axios.get(`${apiBase}/pulls/${prNumber}`, {
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

// Send the diff to ChatGPT API and get a summary
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

// Generate a report for a standalone commit
async function generateCommitReport(repo: string, commit: Commit): Promise<void> {
  try {
    const commitSha = commit.sha;
    const { tagName, releaseName } = getTagAndReleaseNames(repo, commitSha);

    const existingRelease = await findReleaseByTag(tagName);
    if (existingRelease) {
      console.log(`Release for commit ${commitSha} already exists. Skipping...`);
      return;
    }

    const report = `
## Report for Commit ${commitSha}

### Author
${commit.commit.author.name} (${commit.commit.author.email})

### Date
${commit.commit.author.date}

### Commit Message
${commit.commit.message}
    `;

    console.log(report);

    await createRelease(tagName, releaseName, report);
  } catch (error) {
    console.error(`Error generating report for commit ${commit.sha}:`, (error as Error).message);
  }
}

// Create a release
async function createRelease(tagName: string, releaseName: string, body: string): Promise<void> {
  try {
    await axios.post(`${reportRepoBase}/releases`, {
      tag_name: tagName,
      name: releaseName,
      body: body,
      draft: false,
    }, {
      headers: { Authorization: `token ${githubToken}` },
    });

    console.log(`Release created for ${releaseName}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Axios-specific error handling
      console.error("Error message:", error.message);
      console.error("Status code:", error.response?.status);
      console.error("Error data:", error.response?.data);
    } else if (error instanceof Error) {
      // Generic error handling for non-Axios errors
      console.error("An unexpected error occurred:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }
  }
}

// Find a release by its tag
async function findReleaseByTag(tagName: string): Promise<ReleaseResponse | null> {
  try {
    const { data: release } = await axios.get<ReleaseResponse>(`${reportRepoBase}/releases/tags/${tagName}`, {
      headers: { Authorization: `token ${githubToken}` },
    });
    return release;
  } catch (error) {
    if ((error as any).response?.status === 404) {
      return null;
    } else {
      console.error('Error checking release by tag:', (error as Error).message);
      throw error;
    }
  }
}

// Execute the release process for all repositories
startReleaseProcess();
