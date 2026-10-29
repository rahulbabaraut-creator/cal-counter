import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

const app = express();
const port = Number(process.env.PORT || 8787);
app.use(helmet());
app.use(express.json({ limit: '8mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false }));

const foodSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    meal_name: { type: 'string' },
    notes: { type: 'string' },
    items: { type: 'array', minItems: 1, maxItems: 12, items: {
      type: 'object', additionalProperties: false,
      properties: {
        name: { type: 'string' },
        estimated_grams: { type: 'number' },
        calories_per_100g: { type: 'number' },
        protein_g_per_100g: { type: 'number' },
        carbs_g_per_100g: { type: 'number' },
        fat_g_per_100g: { type: 'number' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        assumptions: { type: 'string' }
      },
      required: ['name','estimated_grams','calories_per_100g','protein_g_per_100g','carbs_g_per_100g','fat_g_per_100g','confidence','assumptions']
    }}
  }, required: ['meal_name','notes','items']
};

app.get('/api/health', (_req, res) => res.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY) }));

app.post('/api/analyze-food', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Food scanning is not configured yet. Add OPENAI_API_KEY to server/.env and restart the server.' });
    const { imageDataUrl } = req.body ?? {};
    if (typeof imageDataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)) {
      return res.status(400).json({ error: 'Please send a valid JPEG, PNG or WEBP image.' });
    }
    if (imageDataUrl.length > 7_000_000) return res.status(413).json({ error: 'Image is too large. Try a smaller photo.' });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [{ role: 'user', content: [
        { type: 'input_text', text: `Analyze this meal photo for a nutrition diary. Identify only foods reasonably visible. This is an estimate, not a medical measurement. Do not claim exact weight from a photo. Estimate plausible edible grams and typical nutrition per 100g for each item. Distinguish cooked vs raw where relevant. For mixed dishes, explicitly note uncertainty about oil, ghee, sauces, recipe and hidden ingredients. If portion size is unclear, use a conservative typical serving estimate and say so. Do not make up precise ingredient quantities. Confidence should reflect visual certainty. Use a short plain-language note explaining the main uncertainties. Return only the required structured data.` },
        { type: 'input_image', image_url: imageDataUrl, detail: 'high' }
      ] }],
      text: { format: { type: 'json_schema', name: 'food_analysis', strict: true, schema: foodSchema } },
      max_output_tokens: 1200
    });
    const data = JSON.parse(response.output_text);
    const safeItems = data.items.map((item) => ({
      name: String(item.name).slice(0, 90),
      estimated_grams: clampNumber(item.estimated_grams, 1, 3000, 100),
      calories_per_100g: clampNumber(item.calories_per_100g, 0, 1000, 0),
      protein_g_per_100g: clampNumber(item.protein_g_per_100g, 0, 100, 0),
      carbs_g_per_100g: clampNumber(item.carbs_g_per_100g, 0, 100, 0),
      fat_g_per_100g: clampNumber(item.fat_g_per_100g, 0, 100, 0),
      confidence: ['low','medium','high'].includes(item.confidence) ? item.confidence : 'low',
      assumptions: String(item.assumptions).slice(0, 300)
    }));
    res.json({ meal_name: String(data.meal_name).slice(0, 100), notes: String(data.notes).slice(0, 500), items: safeItems });
  } catch (error) {
    console.error('Food scan failed:', error?.message || error);
    res.status(500).json({ error: 'Could not analyze this photo. Try a clearer image or try again later.' });
  }
});

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

// In production, serve the built React app from this same service. This keeps
// the frontend and API on one origin and avoids exposing the AI key to browsers.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, './dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => console.log(`NutriChrono server listening on port ${port}`));
