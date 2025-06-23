const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

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
  const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
  formData.baseUrl = BASE_URL;

  if (!template) {
    return res.status(400).send('Missing template');
  }

  const templatePath = path.join(__dirname, 'templates', template);

  if (!fs.existsSync(templatePath)) {
    return res.status(404).send('Template not found');
  }

  // Read HTML template
  let html = fs.readFileSync(templatePath, 'utf8');

  // Convert photo to base64 and inject into template
  if (req.file) {
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    formData.photo = base64Image;
  } else {
    formData.photo = ''; // Optional placeholder
  }

  // Replace placeholders in template (e.g., {{name}}, {{photo}}, etc.)
  Object.entries(formData).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, value);
  });

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Inject processed HTML content directly
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
  console.log(`Server running: http://localhost:${PORT}/index.html`);
});