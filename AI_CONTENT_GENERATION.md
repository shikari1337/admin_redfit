# AI Content Generation Feature

## Overview

The AI Content Generation feature allows administrators to automatically generate content for product page sections using Google Gemini AI. This feature uses product details to create contextually relevant content for various sections.

## Setup

### 1. Install Required Package

```bash
cd backend
npm install @google/genai
```

### 2. Configure Gemini API Key

**Option A: Environment Variable**
Add to `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key
```

Get your API key from: https://makersuite.google.com/app/apikey

**Option B: Admin Settings (Recommended)**
1. Go to Admin Panel → Settings
2. Navigate to AI Configuration section
3. Enable Gemini AI
4. Enter your API key (will be encrypted and stored securely)
5. Save settings

## Usage

### Generate Content for Product Sections

1. Navigate to **Products** → Select a product
2. Click **"Manage Sections"** or go to product sections manager
3. Click **"Edit Content"** on any section
4. Click the **"Generate Content"** button (purple button with magic icon)
5. Configure generation options:
   - **Generate Text Content**: Creates headings, descriptions, and text content
   - **Generate Images**: Generates image URLs (placeholder images with deterministic seeds)
   - **Generate Videos**: Placeholder for video generation (to be implemented)
   - **Override Existing Content**: 
     - ✅ Checked: Replaces all existing content with generated content
     - ❌ Unchecked: Only fills missing/empty fields, preserves existing content
6. Click **"Generate"**
7. Review the generated content
8. Click **"Save Content"** to apply changes

## Supported Sections

All product content blocks support AI generation:

- **Features Box**: Generates feature items with titles, descriptions, and icons
- **Why Speedster**: Generates heading, subtitle, and feature items
- **Why Us**: Generates company benefits section
- **Styling Guide**: Generates styling tips with images
- **Testimonials**: Generates section headings and subtitles
- **FAQ**: Generates FAQ section headings
- **Instagram Feed**: Generates post captions and content
- **Wash Care**: Generates heading for wash care instructions
- **Customer Order Gallery**: Generates section headings
- **Videos**: Generates video section headings

## How It Works

1. **Product Context Extraction**: The system extracts product information including:
   - Product name
   - Description
   - Price
   - Categories
   - Images
   - Variants

2. **Section-Specific Prompts**: Each section type has optimized prompts that guide the AI to generate appropriate content:
   - Prompts are tailored to each section's structure
   - Product context is automatically included
   - Existing content is considered when filling missing fields

3. **Content Merging**:
   - **Override Mode**: Completely replaces existing content
   - **Fill Missing Mode**: Intelligently merges generated content with existing content, preserving non-empty fields

4. **Image Generation**: 
   - Currently uses placeholder images with deterministic seeds
   - Images are generated based on product name and section context
   - Can be replaced with actual image URLs later

## API Endpoint

**POST** `/api/v1/products/:id/generate-content`

**Request Body:**
```json
{
  "sectionId": "stylingGuide",
  "options": {
    "generateText": true,
    "generateImages": false,
    "generateVideos": false,
    "overrideExisting": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "heading": "Styling & Pairing Guide",
    "subtitle": "Discover how to style...",
    "items": [...]
  },
  "errors": {
    "text": null,
    "images": null,
    "videos": null
  }
}
```

## Troubleshooting

### Error: "Gemini AI not available"
- Ensure `@google/genai` package is installed
- Check if Gemini AI is enabled in settings
- Verify API key is configured correctly

### Error: "Gemini API key not configured"
- Add `GEMINI_API_KEY` to `.env` file, OR
- Configure via Admin Panel → Settings → AI Configuration

### Generated content is not relevant
- Ensure product has complete information (name, description, categories)
- Try generating with "Override Existing" unchecked first
- Review and manually edit generated content as needed

### Images are placeholders
- This is expected behavior. Images use deterministic placeholders.
- Replace image URLs manually with actual product images if needed
- Future updates may integrate with actual image generation APIs

## Best Practices

1. **Review Generated Content**: Always review AI-generated content before saving
2. **Combine with Manual Editing**: Use AI generation as a starting point, then refine manually
3. **Product Context**: Ensure products have detailed descriptions for better AI results
4. **Fill Missing First**: Start with "Override Existing" unchecked to preserve good content
5. **Iterative Approach**: Generate content in stages (text first, then images if needed)

## Technical Details

- **AI Model**: Google Gemini 2.0 Flash Experimental
- **Response Format**: JSON (automatically parsed)
- **Error Handling**: Graceful fallbacks if AI generation fails
- **Security**: API keys can be encrypted and stored securely
- **Performance**: Content generation typically takes 2-5 seconds

## Future Enhancements

- [ ] Actual image generation using image generation APIs
- [ ] Video generation support
- [ ] Batch content generation for multiple sections
- [ ] Content templates and customization
- [ ] Multi-language support
- [ ] Content quality scoring and suggestions

