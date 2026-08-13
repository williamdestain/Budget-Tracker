const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push('PAGE ERROR: ' + err.message));

await page.goto('http://localhost:8642/', { waitUntil: 'networkidle' });

// Ouvrir la modale
await page.click('button:has-text("Gestion des données")');
await page.waitForSelector('.reset-modal', { timeout: 3000 });

// État initial de la première case
const before = await page.isChecked('.reset-check >> nth=0 >> input[type=checkbox]');
console.log('Coché avant clic :', before);

// Cliquer sur la case (pas juste le label, l'input précisément)
await page.click('.reset-check >> nth=0 >> input[type=checkbox]');
await page.waitForTimeout(200);

const after = await page.isChecked('.reset-check >> nth=0 >> input[type=checkbox]');
console.log('Coché après clic sur le checkbox :', after);

// Vérifier aussi si l'état visuel (classe :has(input:checked)) a changé
const hasCheckedClass = await page.evaluate(() => {
  const label = document.querySelectorAll('.reset-check')[0];
  return label.matches(':has(input:checked)');
});
console.log('Le label a le style "coché" :', hasCheckedClass);

console.log('\nErreurs console :', consoleErrors.length ? consoleErrors : 'aucune');

await browser.close();
