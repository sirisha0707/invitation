const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdf = require('html-pdf-node'); // New plugin
require('dotenv').config();

const app = express();
const PORT = 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const upload = multer({ storage: multer.memoryStorage() });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Preview route (unchanged)
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

// PDF generation using html-pdf-node
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

  const file = { content: html };

  try {
    const pdfBuffer = await pdf.generatePdf(file, {
      format: 'A4',
      printBackground: true,
    });

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
