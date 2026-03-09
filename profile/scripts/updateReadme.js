'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const ORG = 'ReactSphere';
// Use GIT_PAT secret for GitHub API authentication
const TOKEN = process.env.GIT_PAT;
const README_PATH = path.join(__dirname, '..', 'README.md');
const TOP_N = 10;

function apiGet(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      headers: {
        'User-Agent': 'leaderboard-action',
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response (HTTP ${res.statusCode}) for ${apiPath}: ${body}`));
        }
      });
    }).on('error', reject);
  });
}

async function getAllPages(apiPath) {
  const results = [];
  for (let page = 1; ; page++) {
    const sep = apiPath.includes('?') ? '&' : '?';
    const data = await apiGet(`${apiPath}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
  }
  return results;
}

async function main() {
  if (!TOKEN) {
    console.error('GIT_PAT is not set');
    process.exit(1);
  }

  const repos = await getAllPages(`/orgs/${ORG}/repos?type=public`);
  console.log(`Found ${repos.length} repos`);

  const contributors = {};

  for (const repo of repos) {
    // Commits
    try {
      const contribs = await getAllPages(`/repos/${ORG}/${repo.name}/contributors`);
      for (const c of contribs) {
        if (!contributors[c.login]) {
          contributors[c.login] = {
            login: c.login,
            avatar_url: c.avatar_url,
            commits: 0,
            prs: 0,
            issues: 0,
            reviews: 0,
          };
        }
        contributors[c.login].commits += c.contributions;
      }
    } catch (e) {
      console.warn(`Skipping contributors for ${repo.name}: ${e.message}`);
    }

    // Merged PRs
    try {
      const prs = await getAllPages(`/repos/${ORG}/${repo.name}/pulls?state=closed`);
      for (const pr of prs) {
        if (!pr.merged_at) continue;
        const login = pr.user && pr.user.login;
        if (!login) continue;
        if (!contributors[login]) {
          contributors[login] = {
            login,
            avatar_url: pr.user.avatar_url,
            commits: 0,
            prs: 0,
            issues: 0,
            reviews: 0,
          };
        }
        contributors[login].prs += 1;
      }
    } catch (e) {
      console.warn(`Skipping PRs for ${repo.name}: ${e.message}`);
    }

    // Issues (not PRs)
    try {
      const issues = await getAllPages(`/repos/${ORG}/${repo.name}/issues?state=all`);
      for (const issue of issues) {
        if (issue.pull_request) continue;
        const login = issue.user && issue.user.login;
        if (!login) continue;
        if (!contributors[login]) {
          contributors[login] = {
            login,
            avatar_url: issue.user.avatar_url,
            commits: 0,
            prs: 0,
            issues: 0,
            reviews: 0,
          };
        }
        contributors[login].issues += 1;
      }
    } catch (e) {
      console.warn(`Skipping issues for ${repo.name}: ${e.message}`);
    }
  }

  const sorted = Object.values(contributors)
    .map((c) => ({
      ...c,
      total: c.commits + c.prs * 3 + c.issues + c.reviews * 2,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N);

  const medals = ['🥇', '🥈', '🥉'];
  const rows = sorted.map((c, i) => {
    const rank = i < medals.length ? medals[i] : String(i + 1);
    const avatar = `<img src="${c.avatar_url}" width="32"/>`;
    const username = `[@${c.login}](https://github.com/${c.login})`;
    return `| ${rank} | ${avatar} | ${username} | **${c.total}** | ${c.commits} | ${c.prs} | ${c.issues} | ${c.reviews} | 0 |`; // Docs column: not tracked via API
  });

  while (rows.length < TOP_N) {
    rows.push(`| ${rows.length + 1} | - | - | - | - | - | - | - | - |`);
  }

  const today = new Date().toISOString().split('T')[0];
  const table = [
    `> Last updated: ${today}  `,
    `> Showing **Top ${TOP_N} Contributors**`,
    '',
    '| Rank | Avatar | Username | Total | Commits | PRs | Issues | Reviews | Docs |',
    '|------|--------|----------|------:|--------:|----:|------:|--------:|----:|',
    ...rows,
  ].join('\n');

  let readme = fs.readFileSync(README_PATH, 'utf8');
  readme = readme.replace(
    /<!-- LEADERBOARD START -->[\s\S]*?<!-- LEADERBOARD END -->/,
    `<!-- LEADERBOARD START -->\n${table}\n<!-- LEADERBOARD END -->`
  );
  fs.writeFileSync(README_PATH, readme);
  console.log('README leaderboard updated!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
