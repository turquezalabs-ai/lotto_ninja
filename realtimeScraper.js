const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

const RESULTS_FILE = 'results.json';
const PRIZES = { '3D': '₱ 4,500.00', '2D': '₱ 4,000.00' };

async function fetchAndParse() {
  const { data } = await axios.get('https://www.lottopcso.com/');
  const $ = cheerio.load(data);
  const results = [];

  $('table.has-fixed-layout').each((_, table) => {
    const game = $(table).find('thead th:first-child').text().trim();
    const dateStr = $(table).find('thead th:last-child').text().trim();
    const drawDate = new Date(dateStr).toISOString().split('T')[0]; // YYYY-MM-DD

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
    } else {
      // 4D and 6D logic similar...
    }
  });
  return results;
}

async function mergeAndSave(newData) {
  let existing = [];
  try {
    const content = await fs.readFile(RESULTS_FILE, 'utf-8');
    existing = JSON.parse(content);
  } catch (err) { /* file may not exist */ }

  const existingKeys = new Set(existing.map(r => `${r.game}|${r.date}`));
  const added = [];
  for (const rec of newData) {
    const key = `${rec.game}|${rec.date}`;
    if (!existingKeys.has(key)) {
      existing.push(rec);
      added.push(rec);
    }
  }

  if (added.length) {
    existing.sort((a, b) => b.date.localeCompare(a.date));
    await fs.writeFile(RESULTS_FILE, JSON.stringify(existing, null, 2));
    console.log(`Added ${added.length} new records.`);
  } else {
    console.log('No new records.');
  }
}

// Main
fetchAndParse().then(mergeAndSave).catch(console.error);
