import puppeteer from 'puppeteer';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));
  page.on('requestfailed', request => console.log('REQ FAILED:', request.url(), request.failure().errorText));
  page.on('response', response => {
    if (response.url().includes('/api/v1/auth/login')) {
      console.log('LOGIN RESP STATUS:', response.status());
    }
  });

  console.log('Going to login page...');
  await page.goto('http://localhost:3100/login');
  
  await page.type('input[placeholder="admin@gmail.com"]', 'admin@gmail.com');
  await page.type('input[placeholder="password"]', 'password123');
  
  console.log('Clicking sign in...');
  await page.click('button[type="submit"]');
  
  // Wait to see what happens
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Current URL:', page.url());
  
  await browser.close();
})();
