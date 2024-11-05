const axios = require('axios');
require('dotenv').config();

const githubToken = process.env.API_GITHUB_TOKEN;
const owner = 'rainlanguage';
const repo = 'rain.orderbook';
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

const report_owner = 'Siddharth2207';
const report_repo = `release-generator`;
const report_repo_base = `https://api.github.com/repos/${report_owner}/${report_repo}`;

// Function to fetch the latest commit on the main branch
async function fetchLatestMainCommit() {
  try {
    // Fetch the latest commit on the main branch
    const { data: commits } = await axios.get(`${apiBase}/commits`, {
      headers: { Authorization: `token ${githubToken}` },
      params: { sha: 'main', per_page: 1 },
    });

    const latestCommit = commits[0];
    console.log(`Fetching report for latest commit: ${latestCommit.sha}`);

    // Check if the latest commit is associated with a PR
    const pr = await findPRForCommit(latestCommit.sha);
    if (pr) {
      console.log(`Latest commit is associated with PR #${pr.number}`);
      await generateReportForPR(pr);
    } else {
      console.log('Latest commit is not associated with any PR. Generating commit-based report.');
      await generateCommitReport(latestCommit);
    }

  } catch (error) {
    console.error('Error fetching latest commit:', error.message);
  }
}

// Function to find PR for a given commit SHA
async function findPRForCommit(commitSha) {
  try {
    const { data: prs } = await axios.get(`${apiBase}/commits/${commitSha}/pulls`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.groot-preview+json',
      },
    });
    return prs.length > 0 ? prs[0] : null;
  } catch (error) {
    console.error('Error checking PR for commit:', error.message);
    return null;
  }
}

// Function to generate a report for a given PR, including commit messages
async function generateReportForPR(pr) {
  try {
    const { data: commits } = await axios.get(`${apiBase}/pulls/${pr.number}/commits`, {
      headers: { Authorization: `token ${githubToken}` },
    });

    const mergedSHA = pr.merge_commit_sha;

    const existingRelease = await findReleaseByTag(`app-v0.0.0-${mergedSHA}`);
    if (existingRelease) {
      console.log(`Release for PR #${pr.number} with tag app-v0.0.0-${mergedSHA} already exists. Skipping...`);
      return;
    }

    const commitMessages = commits.map(commit => `- ${commit.commit.message}`).join('\n');

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
    `;

    console.log(report);

    await createRelease(`app-v0.0.0-${mergedSHA}`, `Report for PR #${pr.number}`, report);

  } catch (error) {
    console.error(`Error generating report for PR #${pr.number}:`, error.message);
  }
}

// Function to generate a report for a standalone commit
async function generateCommitReport(commit) {
  try {
    const commitSha = commit.sha;

    const existingRelease = await findReleaseByTag(`app-v0.0.0-${commitSha}`);
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

### Raindex App
Release link : https://github.com/${owner}/${repo}/releases/tag/app-v0.0.0-${commitSha}

### Commit Message
${commit.commit.message}
    `;

    console.log(report);

    await createRelease(`app-v0.0.0-${commitSha}`, `App v0.0.0-${commitSha}`, report);
  } catch (error) {
    console.error(`Error generating report for commit ${commit.sha}:`, error.message);
  }
}

// Function to create a release
async function createRelease(tagName, releaseName, body) {
  try {
    await axios.post(`${report_repo_base}/releases`, {
      tag_name: tagName,
      name: releaseName,
      body: body,
      draft: false,
    }, {
      headers: { Authorization: `token ${githubToken}` },
    });

    console.log(`Release created for ${releaseName}`);
  } catch (error) {
    console.error('Error creating release:', error.message);
  }
}

// Function to find a release by its tag
async function findReleaseByTag(tagName) {
  try {
    const { data: release } = await axios.get(`${report_repo_base}/releases/tags/${tagName}`, {
      headers: { Authorization: `token ${githubToken}` },
    });
    return release;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null; // Release not found
    } else {
      console.error('Error checking release by tag:', error.message);
      throw error;
    }
  }
}

// Execute the script
fetchLatestMainCommit();
