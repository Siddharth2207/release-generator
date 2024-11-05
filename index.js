const axios = require('axios');
require('dotenv').config();

const githubToken = process.env.GITHUB_TOKEN;
const owner = 'rainlanguage';
const repo = 'rain.orderbook';
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

const report_owner = 'Siddharth2207'
const report_repo = `release-generator`
const report_repo_base = `https://api.github.com/repos/${report_owner}/${report_repo}`;

async function createRelease(tagName, releaseName, body) {
    try {
      await axios.post(`${report_repo_base}/releases`, {
        tag_name: tagName,
        name: releaseName,
        body: body,
        draft: true,
      }, {
        headers: { Authorization: `token ${githubToken}` },
      });

      console.log(`Release created for ${releaseName}`);
    } catch (error) {
      console.error('Error creating release:', error.message);
    }
  }

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

    // await createRelease(`pr-${pr.number}`, `Report for PR #${pr.number}`, report);

    // You can add code to store or send this report, e.g., save to a file or send via email
  } catch (error) {
    console.error(`Error generating report for PR #${pr.number}:`, error.message);
  }
}

// Execute the script
fetchMergedPRs();