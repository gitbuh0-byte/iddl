# Quick Setup Guide - Photo Studio AI Editor

## 🚀 Quick Start (2 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Get Google API Key
1. Visit: https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key

### 3. Configure API Key
Edit `.env` file (already created):
```
GOOGLE_API_KEY=your_api_key_here
NODE_ENV=development
```

### 4. Run Application
```bash
npm run dev
```

### 5. Open in Browser
Go to: http://localhost:3000

---

## ✨ What You Can Do Now

### ✅ Upload & Auto-Analyze Photos
- Upload JPG, PNG, GIF, or WebP files
- AI automatically detects:
  - Faces (with confidence scores)
  - Text (with extracted content)
  - Signatures
  - QR/Barcodes
  - Backgrounds

### ✅ Edit Photos
- Adjust brightness, contrast, saturation
- Create custom detection layers
- Manage layer visibility and opacity
- Add 4 different component types

### ✅ Export in Multiple Formats
- **PNG**: Lossless, highest quality
- **JPG**: Compressed, smaller file size
- **PSD**: Photoshop-compatible with layers

---

## 🎨 Editor Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Photo Studio    [Tool Buttons]      [Export Buttons]       │
├────────┬────────────────────────────────┬────────────────────┤
│        │                                │                    │
│ Photos │      Image Canvas               │ Adjustments &      │
│        │      (Edit Here)                │ Layer Manager      │
│ List   │                                │                    │
│        │                                │ - Brightness       │
│        │                                │ - Contrast         │
│        │                                │ - Saturation       │
│        │                                │ - Layers           │
│        │                                │ - Statistics       │
│        │                                │                    │
└────────┴────────────────────────────────┴────────────────────┘
```

---

## 🎯 Common Workflows

### Workflow 1: Quick Photo Enhancement
1. Upload photo
2. Adjust brightness/contrast
3. Export as JPG

### Workflow 2: Document Processing
1. Upload document photo
2. Review detected faces, text, signatures
3. Export as PSD for Photoshop editing

### Workflow 3: Professional Archive
1. Upload multiple photos
2. Add custom layers as needed
3. Export each as PNG for archiving

### Workflow 4: Photoshop Integration
1. Upload photo
2. Make adjustments
3. Export as PSD
4. Open in Photoshop for advanced editing

---

## 🔧 Troubleshooting

### Issue: "Cannot find API key" error
**Solution**: 
- Add `GOOGLE_API_KEY=your_key` to `.env`
- Restart the dev server

### Issue: Analysis takes too long
**Solution**:
- Normal: 3-10 seconds
- Large files take longer
- Use smaller images (< 5MB)

### Issue: "Port 3000 already in use"
**Solution**:
```bash
# Use different port
PORT=3001 npm run dev
```

---

## 📊 Features Overview

| Feature | Description | Status |
|---------|-------------|--------|
| Upload Photos | Support JPG, PNG, GIF, WebP | ✅ |
| AI Analysis | Auto-detect faces, text, codes, signatures | ✅ |
| Brightness Adjust | -100% to +100% | ✅ |
| Contrast Adjust | -100% to +100% | ✅ |
| Saturation Adjust | -100% to +100% | ✅ |
| PNG Export | Lossless quality | ✅ |
| JPG Export | 90% quality compressed | ✅ |
| PSD Export | Photoshop layers | ✅ |
| Layer Management | Create, edit, delete layers | ✅ |
| Opacity Control | 0-100% per layer | ✅ |
| Visibility Toggle | Show/hide layers | ✅ |
| Lock Layers | Prevent accidental edits | ✅ |

---

## 📦 Build & Deploy

### Development Build
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### For Deployment
The production build outputs to `dist/` folder
- All assets optimized
- Ready for web server deployment
- Use `npm run build` before deploying

---

## 🎓 Tips & Tricks

### Tip 1: Better AI Detection
- Use clear, well-lit photos
- Ensure good contrast
- Use higher resolution images

### Tip 2: Efficient Workflow
- Use PNG for archiving
- Use JPG for sharing/email
- Use PSD for Photoshop editing

### Tip 3: Layer Management
- Lock important layers to prevent accidents
- Hide reference layers to focus on edits
- Delete unused layers to keep organized

### Tip 4: Custom Layers
- Draw precise areas with the toolbar tools
- Multiple layers of same type are allowed
- Combine auto-detected and custom layers

---

## 🚀 Next Steps

1. ✅ Add Google API key to `.env`
2. ✅ Run `npm run dev`
3. ✅ Open http://localhost:3000
4. ✅ Upload your first photo
5. ✅ Experiment with editing
6. ✅ Export in desired format

---

## 📚 Documentation

- **Full Guide**: See [PHOTO_EDITOR_GUIDE.md](PHOTO_EDITOR_GUIDE.md)
- **API Docs**: Check server.ts comments
- **Components**: React TypeScript types in App.tsx

---

## ✨ Enjoy your AI-powered photo editor!

Need help? Check the troubleshooting section or review the full guide.