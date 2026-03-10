// realtimeScraper.js
const puppeteer = require('puppeteer-core');
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

async function scrapeLottoPcso() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable', // Path to system Chrome
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate with shorter timeout
    await page.goto('https://www.lottopcso.com/', { 
      waitUntil: 'domcontentloaded', // Faster than networkidle0
      timeout: 15000 
    });
    
    // Wait for tables to load
    await page.waitForSelector('table.has-fixed-layout', { timeout: 5000 });
    
    // Extract data
    const results = await page.evaluate((prizes) => {
      const data = [];
      const tables = document.querySelectorAll('table.has-fixed-layout');
      
      tables.forEach(table => {
        const game = table.querySelector('thead th:first-child')?.textContent?.trim() || '';
        const dateStr = table.querySelector('thead th:last-child')?.textContent?.trim() || '';
        
        if (!['6D Lotto', '4D Lotto', '3D Lotto', '2D Lotto'].includes(game)) return;
        
        const rows = table.querySelectorAll('tbody tr');
        
        if (game === '3D Lotto' || game === '2D Lotto') {
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;
            
            let time = cells[0].textContent?.trim() || '';
            const combo = cells[1].textContent?.trim() || '';
            
            time = time.replace(':00', '').replace(' ', '');
            
            if (['2PM', '5PM', '9PM'].includes(time)) {
              data.push({
                date: dateStr,
                game: `${game} ${time}`,
                combination: combo,
                prize: prizes[game.charAt(0)],
                winners: 'TBA'
              });
            }
          });
        } else if (game === '4D Lotto' || game === '6D Lotto') {
          let combo = '', prize = 'TBA', winners = 'TBA';
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;
            
            const key = cells[0].textContent?.trim() || '';
            const value = cells[1].textContent?.trim() || '';
            
            if (key === '9:00 PM') combo = value;
            else if (key === 'First Prize') prize = value.startsWith('₱') ? value : `₱ ${value}`;
            else if (key === 'Number of Winner(s)') winners = value;
          });
          if (combo) {
            data.push({ date: dateStr, game, combination: combo, prize, winners });
          }
        }
      });
      
      return data;
    }, PRIZES);
    
    // Parse dates to YYYY-MM-DD format
    results.forEach(r => {
      r.date = parseDate(r.date);
    });
    
    return results.filter(r => r.date);
    
  } finally {
    await browser.close();
  }
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

  await fs.writeFile(RESULTS_FILE, JSON.stringify(existing, null, 2));
}

// Main execution
(async () => {
  try {
    console.log('🚀 Starting real-time scraper...');
    const newData = await scrapeLottoPcso();
    console.log(`📊 Found ${newData.length} records from lottopcso.com`);
    await mergeAndSave(newData);
    console.log('✅ Scraper completed successfully');
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
})();
