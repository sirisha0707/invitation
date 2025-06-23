const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const executablePath = '/opt/render/.cache/puppeteer/chrome-headless-shell/linux-137.0.7151.119/chrome-linux64/chrome';

// Multer setup for file upload (in memory)
const upload = multer({ storage: multer.memoryStorage() });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Render preview in browser (for testing, not used in PDF generation anymore)
app.get('/preview', (req, res) => {
  const templatePath = path.join(__dirname, 'templates', req.query.template || 'template.html');

  if (!fs.existsSync(templatePath)) {
    return res.status(404).send('Template not found');
  }

  let html = fs.readFileSync(templatePath, 'utf8');

  Object.entries(req.query).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, decodeURIComponent(value));
  });

  res.send(html);
});

// Generate PDF from template + image
app.post('/generate-pdf', upload.single('photo'), async (req, res) => {
  const { template, ...formData } = req.body;
  formData.baseUrl = BASE_URL;

  if (!template) {
    return res.status(400).send('Missing template');
  }

  const templatePath = path.join(__dirname, 'templates', template);

  if (!fs.existsSync(templatePath)) {
    return res.status(404).send('Template not found');
  }

  let html = fs.readFileSync(templatePath, 'utf8');

  if (req.file) {
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    formData.photo = base64Image;
  } else {
    formData.photo = '';
  }

  Object.entries(formData).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, value);
  });

  try {
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=generated.pdf',
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running: ${BASE_URL}/index.html`);
});
