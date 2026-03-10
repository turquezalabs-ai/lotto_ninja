// realtimeScraper.js
const cheerio = require('cheerio');
const fs = require('fs').promises;

const RESULTS_FILE = 'results.json';
const PRIZES = {
  '3D': '₱ 4,500.00',
  '2D': '₱ 4,000.00'
};

function parseDate(dateStr) {
  const months = {
    January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
    July: '07', August: '08', September: '09', October: '10', November: '11', December: '12'
  };
  const match = dateStr.match(/(\w+)\s+(\d+),\s+(\d+)/);
  if (!match) return null;
  const [, month, day, year] = match;
  const monthNum = months[month];
  if (!monthNum) return null;
  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
}

async function fetchAndParse() {
  const response = await fetch('https://www.lottopcso.com/');
  const html = await response.text();
  const $ = cheerio.load(html);
  const results = [];

  $('table.has-fixed-layout').each((_, table) => {
    const game = $(table).find('thead th:first-child').text().trim();
    const dateStr = $(table).find('thead th:last-child').text().trim();
    const drawDate = parseDate(dateStr);
    if (!drawDate) return;

    if (!['6D Lotto', '4D Lotto', '3D Lotto', '2D Lotto'].includes(game)) return;

    const rows = $(table).find('tbody tr');

    if (game === '3D Lotto' || game === '2D Lotto') {
      rows.each((_, row) => {
        const time = $(row).find('td:first-child').text().trim().replace(':00', '').replace(' ', '');
        const combo = $(row).find('td:last-child').text().trim();
        if (['2PM', '5PM', '9PM'].includes(time)) {
          results.push({
            date: drawDate,
            game: `${game} ${time}`,
            combination: combo,
            prize: PRIZES[game.charAt(0)],
            winners: 'TBA'
          });
        }
      });
    } else if (game === '4D Lotto') {
      let combo = '', prize = 'TBA', winners = 'TBA';
      rows.each((_, row) => {
        const key = $(row).find('td:first-child').text().trim();
        const value = $(row).find('td:last-child').text().trim();
        if (key === '9:00 PM') combo = value;
        else if (key === 'First Prize') prize = value.startsWith('₱') ? value : `₱ ${value}`;
        else if (key === 'Number of Winner(s)') winners = value;
      });
      if (combo) {
        results.push({ date: drawDate, game: '4D Lotto', combination: combo, prize, winners });
      }
    } else if (game === '6D Lotto') {
      let combo = '', prize = 'TBA', winners = 'TBA';
      rows.each((_, row) => {
        const key = $(row).find('td:first-child').text().trim();
        const value = $(row).find('td:last-child').text().trim();
        if (key === '9:00 PM') combo = value;
        else if (key === 'First Prize') prize = value.startsWith('₱') ? value : `₱ ${value}`;
        else if (key === 'Number of Winner(s)') winners = value;
      });
      if (combo) {
        results.push({ date: drawDate, game: '6D Lotto', combination: combo, prize, winners });
      }
    }
  });

  return results;
}

async function mergeAndSave(newData) {
  let existing = [];
  try {
    const content = await fs.readFile(RESULTS_FILE, 'utf-8');
    existing = JSON.parse(content);
  } catch (err) {
    // File doesn't exist, start with empty array
  }

  const existingKeys = new Set(existing.map(r => `${r.game}|${r.date}`));
  let addedCount = 0;
  for (const rec of newData) {
    const key = `${rec.game}|${rec.date}`;
    if (!existingKeys.has(key)) {
      existing.push(rec);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    existing.sort((a, b) => b.date.localeCompare(a.date));
    console.log(`✅ Added ${addedCount} new records.`);
  } else {
    console.log('ℹ️ No new records.');
  }

  // Always write the file to ensure it exists for FTP upload
  await fs.writeFile(RESULTS_FILE, JSON.stringify(existing, null, 2));
}

// Main execution
fetchAndParse()
  .then(mergeAndSave)
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
