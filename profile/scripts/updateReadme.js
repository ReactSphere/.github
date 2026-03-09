import fs from 'fs';

// Load the generated leaderboard table
const leaderboardTable = fs.readFileSync('./leaderboard.md', 'utf8');

// Load your main README
let readme = fs.readFileSync('README.md', 'utf8');

// Replace the section between the markers
readme = readme.replace(
  /<!-- LEADERBOARD START -->[\s\S]*<!-- LEADERBOARD END -->/,
  `<!-- LEADERBOARD START -->\n${leaderboardTable}\n<!-- LEADERBOARD END -->`
);

// Write back to README
fs.writeFileSync('README.md', readme);
console.log('README leaderboard updated!');
