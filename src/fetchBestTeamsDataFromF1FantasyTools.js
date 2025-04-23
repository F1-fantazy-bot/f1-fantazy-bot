const puppeteer = require('puppeteer');
const { sendLogMessage } = require('./utils');

exports.fetchBestTeamsDataFromF1FantasyTools = async function (bot) {
  let data;
  try {
    data = await fetchData(bot);
  } catch (error) {
    sendLogMessage(bot, `Error fetching data: ${error.message}`);

    return;
  }

  console.log('Fetched data:', data);
};

async function fetchData(bot) {
  const url = 'https://f1fantasytools.com/team-calculator';
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    // ── wait for heading text “Drivers” to show up ──
    await page.waitForSelector('h3', {
      timeout: 15_000,
      visible: true,
    });

    // ── Run JS inside the page to scrape rows ──
    const result = await page.evaluate(() => {
      // helper function to grab table rows following a given <h3>
      function scrapeTable(headingText) {
        const h3 = [...document.querySelectorAll('h3')].find(
          (h) => h.textContent.trim() === headingText
        );
        if (!h3) {
          return [];
        }
        const table =
          h3.nextElementSibling?.querySelector('table') ||
          h3.parentElement?.querySelector('table');
        if (!table) {
          return [];
        }

        const out = [];
        table.querySelectorAll('tbody tr').forEach((tr) => {
          const tds = tr.querySelectorAll('td');
          if (tds.length < 3) {
            return;
          }
          const code = tds[0].textContent.trim();
          if (!/^[A-Z]{2,4}$/.test(code)) {
            return;
          }

          const price = parseFloat(tds[1].textContent);
          const delta = parseFloat(tds[2].textContent);

          // xPts lives further right, often inside an input
          let pts;
          tds.forEach((td, idx) => {
            if (idx < 3 || pts !== undefined) {
              return;
            }
            const inp = td.querySelector('input[value]');
            const raw =
              inp?.value || td.textContent.match(/-?\d+(?:\.\d+)?/)?.[0];
            if (raw) {
              pts = parseFloat(raw);
            }
          });
          if (pts !== undefined) {
            out.push({ code, price, delta, pts });
          }
        });

        return out;
      }

      function scrapeSimulationName() {
        const label = [...document.querySelectorAll('label')].find(
          (l) => l.textContent.trim() === 'Select a simulation preset'
        );
        if (!label) {
          return 'unknown - cant find relevant label';
        }

        return (
          label.nextElementSibling?.querySelectorAll('span')[1]?.textContent ||
          'unknown - cant find relevant span'
        );
      }

      return {
        drivers: scrapeTable('Drivers'),
        constructors: scrapeTable('Constructors'),
        simulationName: scrapeSimulationName(),
      };
    });

    await browser.close();
    sendLogMessage(bot, JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    await browser.close();
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}
