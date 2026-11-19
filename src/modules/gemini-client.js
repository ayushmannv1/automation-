/**
 * Gemini Vision API client - calls API directly from browser
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-flash';

export class GeminiClient extends EventTarget {
  constructor() {
    super();
    this._apiKey = '';
    this._requestCount = 0;
  }

  get apiKey() { return this._apiKey; }
  get requestCount() { return this._requestCount; }

  setApiKey(key) {
    this._apiKey = key.trim();
    // Save to localStorage
    if (this._apiKey) {
      localStorage.setItem('carjam_gemini_key', this._apiKey);
    }
  }

  loadSavedKey() {
    const saved = localStorage.getItem('carjam_gemini_key');
    if (saved) {
      this._apiKey = saved;
      return saved;
    }
    return null;
  }

  /**
   * Analyze game state using Gemini Vision
   * @param {string} prompt - Text prompt
   * @param {string[]} screenshotBase64Array - Array of base64 encoded PNG screenshots
   * @returns {Promise<Object>} Parsed JSON response
   */
  async analyzeScreenshots(prompt, screenshotBase64Array) {
    if (!this._apiKey) {
      throw new Error('Gemini API key not set');
    }

    // Build parts array: text prompt + inline images
    const parts = [{ text: prompt }];
    for (const b64 of screenshotBase64Array) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: b64,
        },
      });
    }

    const url = `${API_BASE}/${MODEL}:generateContent?key=${this._apiKey}`;
    const body = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    };

    this._requestCount++;
    this.dispatchEvent(new CustomEvent('request', { detail: { count: this._requestCount } }));

    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // If 404 model not found, try gemini-2.0-flash or gemini-1.5-flash as fallback
    if (response.status === 404) {
      const fallbackUrl = `${API_BASE}/gemini-2.0-flash:generateContent?key=${this._apiKey}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (fallbackRes.ok) {
        response = fallbackRes;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Gemini API error (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error?.message || errorMsg;
      } catch (e) { /* use default */ }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    
    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    // Parse JSON response
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch (e) {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      // Try finding JSON object in text
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        return JSON.parse(objMatch[0]);
      }
      throw new Error(`Failed to parse Gemini response as JSON: ${text.substring(0, 200)}`);
    }
  }

  /**
   * Validate that the API key works
   */
  async validateKey() {
    const url = `${API_BASE}/${MODEL}:generateContent?key=${this._apiKey}`;
    const body = {
      contents: [{ parts: [{ text: 'Reply with just: OK' }] }],
      generationConfig: { maxOutputTokens: 10 },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API key validation failed: ${response.status}`);
    }

    return true;
  }
}
