#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PROJECTS_PATH = resolve(__dirname, 'projects.json');
const CACHE_PATH = resolve(__dirname, 'stats-cache.json');
const README_PATH = resolve(ROOT, 'README.md');

const TOKEN = process.env.GITHUB_TOKEN || '';

const LINGUIST_COLORS = {
  Rust: 'dea584',
  Python: '3572A5',
  Dockerfile: '384d54',
  Go: '00ADD8',
  TypeScript: '3178C6',
  Svelte: 'ff3e00',
  JavaScript: 'f1e05a',
  Shell: '89e051',
  HTML: 'e34c26',
  CSS: '563d7c',
  Java: 'b07219',
  'C++': 'f34b7d',
  C: '555555',
  Ruby: '701516',
  PHP: '4F5D95',
  Vue: '41b883',
  Swift: 'ffac45',
  Kotlin: 'A97BFF',
  Scala: 'c22d40',
  Dart: '00B4AB',
  Elixir: '6e4a7e',
  Haskell: '5e5086',
  Lua: '000080',
  Perl: '0298c3',
  R: '198CE7',
  Julia: 'a270ba',
  'C#': '178600',
  'Objective-C': '438eff',
  Groovy: 'e69f56',
  PowerShell: '012456',
  'Jupyter Notebook': 'DA5B0B',
  TeX: '3D6117',
  'Vim script': '199f4b',
  Markdown: '083fa1',
};

function shieldEncode(str) {
  return encodeURIComponent(str)
    .replace(/-/g, '--')
    .replace(/_/g, '__')
    .replace(/%20/g, '_');
}

function metric(n) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    if (m >= 10) return Math.round(m) + 'm';
    return Math.round(m * 10) / 10 + 'm';
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    if (k >= 10) return Math.round(k) + 'k';
    return Math.round(k * 10) / 10 + 'k';
  }
  return String(n);
}

function badgeUrl(label, message, color, style) {
  const path = `${shieldEncode(label)}-${shieldEncode(message)}-${shieldEncode(color)}`;
  let url = `https://img.shields.io/badge/${path}`;
  const qs = [];
  if (style) qs.push(`style=${encodeURIComponent(style)}`);
  if (qs.length) url += '?' + qs.join('&');
  return url;
}

async function githubFetch(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'profile-stats-updater',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  return fetch(url, { headers });
}

async function fetchLanguage(repo) {
  const url = `https://api.github.com/repos/${repo}/languages`;
  const res = await githubFetch(url);
  if (!res.ok) throw new Error(`languages ${res.status}`);
  const data = await res.json();
  let maxLang = 'unknown';
  let maxBytes = -1;
  for (const [lang, bytes] of Object.entries(data)) {
    if (bytes > maxBytes) {
      maxBytes = bytes;
      maxLang = lang;
    }
  }
  return maxLang;
}

async function fetchCommits(repo) {
  const url = `https://api.github.com/repos/${repo}/commits?per_page=1`;
  const res = await githubFetch(url);
  if (!res.ok) throw new Error(`commits ${res.status}`);
  const link = res.headers.get('link') || '';
  const match = link.match(/[?&]page=(\d+)[^>]*>; rel="last"/);
  if (match) return parseInt(match[1], 10);
  const body = await res.json();
  return Array.isArray(body) ? body.length : 0;
}

async function fetchStars(repo) {
  const url = `https://api.github.com/repos/${repo}`;
  const res = await githubFetch(url);
  if (!res.ok) throw new Error(`stars ${res.status}`);
  const data = await res.json();
  return data.stargazers_count ?? 0;
}

async function fetchPRs(repo, author) {
  const q = encodeURIComponent(`repo:${repo} author:${author} is:pr`);
  const url = `https://api.github.com/search/issues?q=${q}`;
  const res = await githubFetch(url);
  if (!res.ok) throw new Error(`prs ${res.status}`);
  const data = await res.json();
  return data.total_count ?? 0;
}

let cache = {};
if (existsSync(CACHE_PATH)) {
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch (e) {
    console.warn('Failed to read cache, starting fresh:', e.message);
    cache = {};
  }
}

let projects;
try {
  projects = JSON.parse(readFileSync(PROJECTS_PATH, 'utf8'));
} catch (e) {
  console.error('Failed to read projects.json:', e.message);
  process.exit(1);
}

async function resolveBadge(card, badge) {
  const repo = badge.repo || card.repo;

  switch (badge.kind) {
    case 'language': {
      const key = `${repo}|language`;
      let lang;
      try {
        lang = await fetchLanguage(repo);
        cache[key] = lang;
      } catch (e) {
        console.warn(`Failed to fetch language for ${repo}: ${e.message}`);
        lang = cache[key] || 'unknown';
      }
      const color = badge.color || LINGUIST_COLORS[lang] || '999999';
      return { url: badgeUrl('language', lang, color), alt: 'language' };
    }
    case 'commits': {
      const key = `${repo}|commits`;
      let count;
      try {
        count = await fetchCommits(repo);
        cache[key] = count;
      } catch (e) {
        console.warn(`Failed to fetch commits for ${repo}: ${e.message}`);
        count = typeof cache[key] === 'number' ? cache[key] : 0;
      }
      return { url: badgeUrl('commits', String(count), badge.color || '4F6BED'), alt: 'commits' };
    }
    case 'stars': {
      const key = `${repo}|stars`;
      let count;
      try {
        count = await fetchStars(repo);
        cache[key] = count;
      } catch (e) {
        console.warn(`Failed to fetch stars for ${repo}: ${e.message}`);
        count = typeof cache[key] === 'number' ? cache[key] : 0;
      }
      return {
        url: badgeUrl('stars', metric(count), badge.color || 'f5c542', badge.style),
        alt: 'stars',
      };
    }
    case 'prs': {
      if (typeof badge.value === 'number') {
        return { url: badgeUrl('PRs', String(badge.value), badge.color || '8250df'), alt: 'PRs' };
      }
      const key = `${repo}|prs|${badge.author}`;
      let count;
      try {
        count = await fetchPRs(repo, badge.author);
        cache[key] = count;
      } catch (e) {
        console.warn(`Failed to fetch PRs for ${repo} by ${badge.author}: ${e.message}`);
        count = typeof cache[key] === 'number' ? cache[key] : 0;
      }
      return { url: badgeUrl('PRs', String(count), badge.color || '8250df'), alt: 'PRs' };
    }
    default:
      throw new Error(`Unknown badge kind: ${badge.kind}`);
  }
}

async function main() {
  for (const block of projects.blocks) {
    if (block.kind !== 'grid') continue;
    for (const card of block.cards) {
      for (const badge of card.badges) {
        const resolved = await resolveBadge(card, badge);
        badge._url = resolved.url;
        badge._alt = resolved.alt;
      }
    }
  }

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');

  const parts = [];
  for (const block of projects.blocks) {
    if (block.kind === 'markdown') {
      parts.push(block.content.replace(/\n+$/, ''));
    } else if (block.kind === 'grid') {
      const cols = block.columns || 2;
      let grid = '<div align="center">\n<table>\n';
      for (let i = 0; i < block.cards.length; i += cols) {
        grid += '<tr>\n';
        for (let j = i; j < i + cols && j < block.cards.length; j++) {
          const card = block.cards[j];
          const widthPct = Math.round(100 / cols);
          grid += `<td width="${widthPct}%" align="center">\n`;
          const link = card.link || `https://github.com/${card.repo}`;
          grid += `<a href="${link}"><strong>${card.name}</strong></a><br>\n`;
          for (const badge of card.badges) {
            grid += `<img src="${badge._url}" alt="${badge._alt}">&nbsp;`;
            if (badge.break) grid += '<br>\n';
          }
          grid += '<br>\n';
          if (card.blurb) {
            grid += `<sub>${card.blurb}</sub>\n`;
          }
          grid += '</td>\n';
        }
        grid += '</tr>\n';
      }
      grid += '</table>\n</div>';
      parts.push(grid);
    }
  }
  const rendered = parts.join('\n\n');

  let readme = readFileSync(README_PATH, 'utf8');
  const startMarker = '<!-- stats:start -->';
  const endMarker = '<!-- stats:end -->';
  const startIdx = readme.indexOf(startMarker);
  const endIdx = readme.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found in README.md');
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + startMarker.length);
  const after = readme.slice(endIdx);
  readme = before + '\n\n' + rendered + '\n\n' + after;
  writeFileSync(README_PATH, readme, 'utf8');
  console.log('README.md updated successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
