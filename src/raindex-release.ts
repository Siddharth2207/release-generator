import axios from 'axios';
import * as dotenv from 'dotenv';
import { Commit, PullRequest, ReleaseResponse, ChatGPTResponse } from './types';

dotenv.config();

const githubToken = process.env.API_GITHUB_TOKEN as string;
const openaiToken = process.env.OPENAI_API_KEY as string;
const owner = 'rainlanguage';
const repos = ['rain.orderbook', 'rain.webapp'];
const reportOwner = 'Siddharth2207';
const reportRepo = 'raindex-releases';
const reportRepoBase = `https://api.github.com/repos/${reportOwner}/${reportRepo}`;

// Utility function to generate tagName and releaseName based on repository
function getTagAndReleaseNames(repo: string, commitSha: string): { tagName: string; releaseName: string } {
  if (repo === 'rain.orderbook') {
    return { tagName: `app-v0.0.0-${commitSha}`, releaseName: `App v0.0.0-${commitSha}` };
  } else if (repo === 'rain.webapp') {
    return { tagName: `webapp-v0.0.0-${commitSha}`, releaseName: `RaindexWebApp v0.0.0-${commitSha}` };
  }
  return { tagName: `release-v0.0.0-${commitSha}`, releaseName: `Release v0.0.0-${commitSha}` };
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
      headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.groot-preview+json' },
    });
    return prs.length > 0 ? prs[0] : null;
  } catch (error) {
    console.error('Error checking PR for commit:', (error as Error).message);
    return null;
  }
}

// Generate a report for a PR, including commit messages and structured analysis
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

    // Generate structured sections using ChatGPT
    const structuredSummary = await analyzeStructuredSummaryWithChatGPT(pr.body, diff);

    // App release link for rain.orderbook
    const appReleaseLink = repo === 'rain.orderbook'
      ? `\n### 🌐 App Release\n[View Release on GitHub](https://github.com/rainlanguage/rain.orderbook/releases/tag/${tagName})\n`
      : '';

    const report = `
# Raindex Release Notes - ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

## Release: ${releaseName}

### ⬆️ Overview
> ${structuredSummary.overview || "This release includes important updates."}

- **PR Summary**: ${pr.title}
  - **Author**: ${pr.user.login}
  - **Merged At**: ${formatTimeAgo(pr.merged_at)}

---

### 🎯 Highlights
${structuredSummary.highlights || "- No specific highlights noted."}

### 🏗️ Architecture Changes
${structuredSummary.architectureChanges || "- No architectural changes introduced."}

### 🔍 Code Diff Analysis
${structuredSummary.diffAnalysis || "- No code analysis available."}

### 🧪 Tests
${structuredSummary.testing || "- No testing updates provided."}

${appReleaseLink}

---

### 📜 Full PR Description
> ${pr.body || 'No additional details provided.'}

---

### 📄 Detailed Commit Messages
${commitMessages}
`;

    console.log(report);

    await createRelease(tagName, releaseName, report);
  } catch (error) {
    console.error(`Error generating report for PR #${pr.number}:`, (error as Error).message);
  }
}

// Enhanced function to generate structured summary with ChatGPT
async function analyzeStructuredSummaryWithChatGPT(prBody: string | null, diff: string): Promise<any> {
  try {
    const response = await axios.post<ChatGPTResponse>(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert release notes generator. Based on the provided PR summary and code diff, generate detailed release notes structured as follows:

            - "Overview" (concise summary of the release)
            - "🎯 Highlights" (list of significant highlights)
            - "🏗️ Architecture Changes" (technical changes to the system architecture)
            - "🔍 Code Diff Analysis" (specific code changes, optimizations)
            - "🧪 Tests" (any updates or changes in testing)
            
            If a section is not relevant, provide "No information available."`,
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

    // Ensure structured sections are returned as an object
    const content = response.data.choices[0].message.content.trim();
    return {
      overview: content.includes("Overview") ? content.split("Overview")[1].split("🎯")[0].trim() : "No information available.",
      highlights: content.includes("🎯 Highlights") ? content.split("🎯 Highlights")[1].split("🏗️")[0].trim() : "No specific highlights noted.",
      architectureChanges: content.includes("🏗️ Architecture Changes") ? content.split("🏗️ Architecture Changes")[1].split("🔍")[0].trim() : "No architectural changes introduced.",
      diffAnalysis: content.includes("🔍 Code Diff Analysis") ? content.split("🔍 Code Diff Analysis")[1].split("🧪")[0].trim() : "No code analysis available.",
      testing: content.includes("🧪 Tests") ? content.split("🧪 Tests")[1].trim() : "No testing updates provided.",
    };
  } catch (error) {
    console.error('Error analyzing structured summary with ChatGPT:', (error as Error).message);
    return {
      overview: "No information available.",
      highlights: "No specific highlights noted.",
      architectureChanges: "No architectural changes introduced.",
      diffAnalysis: "No code analysis available.",
      testing: "No testing updates provided.",
    };
  }
}

// Helper function to format "time ago" for merged date
function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  return `${diffInHours} hours ago`;
}

// Fetch the code diff for a PR
async function fetchDiffForPR(prNumber: number, apiBase: string): Promise<string> {
  try {
    const { data } = await axios.get(`${apiBase}/pulls/${prNumber}`, {
      headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3.diff' },
    });
    return data;
  } catch (error) {
    console.error(`Error fetching diff for PR #${prNumber}:`, (error as Error).message);
    return '';
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
      console.error("Error message:", error.message);
      console.error("Status code:", error.response?.status);
      console.error("Error data:", error.response?.data);
    } else if (error instanceof Error) {
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
