const axios = require('axios');
require('dotenv').config();

const githubToken = process.env.GITHUB_TOKEN;
const owner = 'rainlanguage';
const repo = 'rain.orderbook';
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

// Function to fetch and generate report for recent merged PRs
async function fetchMergedPRs() {
  try {
    const { data: pulls } = await axios.get(`${apiBase}/pulls`, {
      headers: { Authorization: `token ${githubToken}` },
      params: { state: 'closed', base: 'main', per_page: 1 },
    });

    for (const pr of pulls) {
      if (pr.merged_at) {
        console.log(`Generating report for PR #${pr.number}`);
        await generateReportForPR(pr);
      }
    }
  } catch (error) {
    console.error('Error fetching PRs:', error.message);
  }
}

// Function to generate a report for a given PR, including commit messages
async function generateReportForPR(pr) {
  try {
    // Fetch commits associated with the PR
    const { data: commits } = await axios.get(`${apiBase}/pulls/${pr.number}/commits`, {
      headers: { Authorization: `token ${githubToken}` },
    });

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
${commitMessages}

    `;

    console.log(report);

    // You can add code to store or send this report, e.g., save to a file or send via email
  } catch (error) {
    console.error(`Error generating report for PR #${pr.number}:`, error.message);
  }
}

// Execute the script
fetchMergedPRs();


