# Photo Studio - AI-Powered Photo Editor & Analyzer

A cutting-edge photo editing application that automatically analyzes images using Google's Gemini AI and enables professional editing with export options including PSD (Photoshop format).

## 🎯 Core Features

### 1. **Automatic Image Analysis**
- 🤖 AI-powered component detection using Gemini 2.0 Flash
- Detects and labels:
  - **Faces**: Portrait and facial regions with confidence scores
  - **Text**: Text blocks with content extraction
  - **Signatures**: Handwritten signature areas
  - **QR/Barcodes**: Code regions with type identification
  - **Backgrounds**: Background type and color analysis

### 2. **Advanced Photo Editing**
- **Adjustment Tools**:
  - Brightness control (-100% to +100%)
  - Contrast enhancement (-100% to +100%)
  - Saturation adjustment (-100% to +100%)
  
- **Layer Management**:
  - Create custom detection layers
  - Adjust layer opacity
  - Toggle layer visibility
  - Lock/unlock layers to prevent accidental changes
  - Delete unwanted layers

### 3. **Multi-Format Export**
- **PNG Export**: Lossless format, full quality
- **JPG Export**: Compressed format (90% quality), smaller files
- **PSD Export**: Full Photoshop compatibility with:
  - Original image as reference layer (hidden)
  - Edited version with all adjustments
  - Individual layers for each detected component
  - Full non-destructive editing in Photoshop

## 🚀 Getting Started

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager
- Google API key (free from [aistudio.google.com](https://aistudio.google.com/app/apikey))

### Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Configure API Key**:
Create or update `.env` file:
```
GOOGLE_API_KEY=your_google_api_key_here
NODE_ENV=development
```

3. **Start Development Server**:
```bash
npm run dev
```

4. **Open Application**:
Navigate to `http://localhost:3000` in your browser

## 📖 How to Use

### Uploading Photos
1. Click the **"Upload"** button in the left sidebar
2. Select an image file (supports: JPG, PNG, GIF, WebP)
3. AI automatically analyzes the image (3-10 seconds)
4. Detected components appear as layers on the right sidebar

### Editing Workflow

#### Step 1: Review Auto-Detected Layers
- Check the "Detected Layers" panel on the right
- See statistics showing what was found:
  - Number of faces
  - Text areas
  - Signatures
  - QR/Barcode codes

#### Step 2: Apply Adjustments
In the "Adjustments" panel:
- Adjust **Brightness**: Make image lighter or darker
- Adjust **Contrast**: Increase or decrease color contrast
- Adjust **Saturation**: Make colors more or less vibrant

#### Step 3: Manage Layers
- **Select Layer**: Click any layer in the list
- **Adjust Opacity**: Use slider (0-100%)
- **Toggle Visibility**: Click eye icon to show/hide
- **Lock/Unlock**: Prevent accidental edits
- **Delete**: Hover and click trash icon

#### Step 4: Add Custom Layers
Use the toolbar at the top to manually add areas:
- 👤 **Face**: Blue, for portrait areas
- 📄 **Text**: Red, for text areas
- ✍️ **Signature**: Purple, for signature areas
- 🔲 **Code**: Green, for QR/barcode areas

To draw:
1. Click the tool in header
2. Click and drag on the canvas to create a rectangular area
3. Release to confirm

#### Step 5: Export
Choose your export format:
- **PNG**: Click PNG button (lossless quality)
- **JPG**: Click JPG button (compressed, web-ready)
- **PSD**: Click PSD button (Photoshop format)

File downloads automatically to your Downloads folder.

## 🎨 Layer Types & Colors

| Type | Color | Icon | Best For |
|------|-------|------|----------|
| Face | 🔵 Blue | 👤 | Portraits, ID photos |
| Text | 🔴 Red | 📄 | Headers, labels, documents |
| Signature | 🟣 Purple | ✍️ | Signed documents, autographs |
| Code | 🟢 Green | 🔲 | QR codes, barcodes, UPC |
| Background | 🟡 Yellow | 🖼️ | Document backgrounds, patterns |

## 💾 Export Format Guide

### PNG Export
**Best for**: Archiving, sharing with transparency support
- Format: Portable Network Graphics
- Quality: Lossless (100%)
- File size: Larger (~2-5MB for typical photos)
- Use case: Professional archiving, transparency needs

### JPG Export
**Best for**: Web sharing, email, general use
- Format: Joint Photographic Experts Group
- Quality: 90% (excellent visual quality)
- File size: Smaller (~300KB-1MB for typical photos)
- Use case: Email, web upload, social media

### PSD Export
**Best for**: Further editing in Photoshop
- Format: Photoshop Document
- Layers: Fully editable structure
  - Reference layer (original)
  - Edited layer (with your adjustments)
  - Component layers (faces, text, codes, etc.)
- File size: Comparable to PNG
- Use case: Professional editing, Photoshop workflow, archiving with editability

## 📊 Detection Accuracy

The AI detection system provides:
- **Face Detection**: Confidence scores (0-100%)
- **Text Recognition**: Extracted text content and location
- **Signature Detection**: High precision for typical signatures
- **Code Detection**: Type identification (QR, barcode, etc.)
- **Background Analysis**: Type and dominant color

### Tips for Better Detection
1. Use clear, well-lit photos
2. Ensure good contrast between subject and background
3. Upload higher resolution images when possible
4. Avoid heavily skewed or rotated content

## 🔧 Technical Details

### Backend (server.ts)
- Express.js web framework
- Multer for file uploads
- Google Generative AI integration
- Automatic cleanup of old uploads (1 hour retention)
- 50MB file size limit

### Frontend (App.tsx)
- React 19 with TypeScript
- Real-time canvas rendering
- Layer-based editing system
- PSD generation with ag-psd library
- Tailwind CSS for styling
- Lucide React icons

### API Endpoint

**POST /api/upload**
```
Content-Type: multipart/form-data

image: <binary file data>
```

Response:
```json
{
  "success": true,
  "filename": "upload_id",
  "originalName": "photo.jpg",
  "analysis": {
    "faces": [{"x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100, "confidence": 0.95}],
    "text": [{"x": 0, "y": 0, "width": 0, "height": 0, "content": "detected text"}],
    "signatures": [{"x": 0, "y": 0, "width": 0, "height": 0}],
    "codes": [{"x": 0, "y": 0, "width": 0, "height": 0, "type": "qr"}],
    "backgrounds": [{"type": "solid", "color": "white"}],
    "components": ["face", "text", "code"]
  }
}
```

## 🛠️ Build Commands

```bash
# Development server
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview

# Type checking
npm run lint

# Clean build artifacts
npm run clean
```

## 📁 Project Structure

```
photo-studio/
├── src/
│   ├── App.tsx           # Main React component
│   ├── main.tsx          # React DOM entry point
│   ├── index.css         # Global styles
│   └── index.html        # HTML template
├── server.ts             # Express backend
├── vite.config.ts        # Vite bundler config
├── tsconfig.json         # TypeScript config
├── tailwind.config.js    # Tailwind CSS config
├── package.json          # Dependencies
├── .env                  # Environment variables
└── uploads/              # Temporary file storage
```

## 🐛 Troubleshooting

### "Cannot find GOOGLE_API_KEY"
- ✅ Create `.env` file in project root
- ✅ Add: `GOOGLE_API_KEY=your_key_here`
- ✅ Restart dev server (`npm run dev`)

### Image analysis is slow
- Normal: 3-10 seconds for typical images
- Large images (>10MB): May take up to 30 seconds
- Check: Internet connection quality
- Solution: Use smaller image files (< 5MB)

### PSD file won't open in Photoshop
- Ensure: Photoshop version 2020 or later
- Try: Regenerate PSD export
- Solution: Use PNG/JPG export as fallback

### Export button is grayed out
- Required: Must have at least one photo uploaded
- Solution: Upload an image first

### Browser freezes during export
- Cause: Large image size
- Solution: Use JPG instead of PNG for compression
- Alternative: Reduce canvas size before export

## 🔐 Privacy & Security

- Images are processed locally and on Google's servers
- Temporary files are deleted after 1 hour
- No data is permanently stored
- API key is kept server-side (not exposed to browser)

## 📝 Keyboard Shortcuts

- **Esc**: Deselect layer
- **Delete**: Delete selected layer
- **Enter**: Confirm current operation

## 🎓 Use Cases

### Document Processing
- Identify and extract components from scanned documents
- Enhance document clarity and contrast
- Preserve signatures and important markings

### Portrait Enhancement
- Auto-detect faces and portraits
- Adjust brightness and contrast
- Create layered edits in Photoshop

### QR Code & Barcode Analysis
- Identify code locations
- Extract positioning data
- Create PSD with code layers

### ID/Passport Processing
- Auto-detect faces and text areas
- Create compliant document versions
- Export for verification systems

## 📞 Support

For issues or feature requests:
1. Check this guide first
2. Review troubleshooting section
3. Check browser console for error messages
4. Restart development server

## 📄 License

MIT - Feel free to use and modify

---

**Made with ❤️ using React, TypeScript, and Google Gemini AI**