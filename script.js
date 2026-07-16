/**
 * EXIF Watermark Studio
 * ----------------------
 * Implemented: upload (device + drag & drop), replace, preview,
 * automatic EXIF reading into editable metadata fields, a live
 * watermark preview that redraws instantly on every keystroke,
 * and export of the final watermarked image.
 */

// Preview
const viewfinder = document.querySelector('.viewfinder');
const previewImage = document.querySelector('.preview__image');
const previewEmptyState = document.querySelector('.preview__empty');

// Watermark plate (rendered below the image, updates live as text)
const wmPlate = document.getElementById('wmPlate');
const wmBrand = document.getElementById('wmBrand');
const wmModel = document.getElementById('wmModel');
const wmLens = document.getElementById('wmLens');
const wmSpecs = document.getElementById('wmSpecs');
const wmMeta = document.getElementById('wmMeta');

// Template picker
const templatePicker = document.getElementById('templatePicker');
const templateButtons = Array.from(templatePicker.querySelectorAll('.template-swatch'));
let currentTemplate = 'hasselblad';

// Brand logo — badge element is created here (no HTML/CSS file edits
// needed) and swapped with the generic ring depending on brand match.
const wmLogoZone = document.querySelector('.wm-plate__logo');
const wmRing = document.querySelector('.wm-plate__ring');
const wmBrandBadge = document.createElement('span');
wmBrandBadge.className = 'wm-plate__brand-badge';
wmBrandBadge.setAttribute('aria-hidden', 'true');
wmBrandBadge.style.cssText = [
  'display:none',
  'width:1.5rem',
  'height:1.5rem',
  'border-radius:50%',
  'align-items:center',
  'justify-content:center',
  'font-family:"JetBrains Mono",ui-monospace,monospace',
  'font-size:0.52rem',
  'font-weight:700',
  'letter-spacing:0.01em',
  'line-height:1',
].join(';');
wmRing.insertAdjacentElement('afterend', wmBrandBadge);

// Custom uploaded logo — a chip that auto-fits any PNG via object-fit:
// contain, so it never renders too small or too large in the slot.
const wmCustomLogoChip = document.createElement('span');
wmCustomLogoChip.className = 'wm-plate__custom-logo-chip';
wmCustomLogoChip.setAttribute('aria-hidden', 'true');
const wmCustomLogo = document.createElement('img');
wmCustomLogo.className = 'wm-plate__custom-logo';
wmCustomLogo.alt = '';
wmCustomLogoChip.appendChild(wmCustomLogo);
wmBrandBadge.insertAdjacentElement('afterend', wmCustomLogoChip);

// "Show Logo" toggle — injected into the editor form next to the
// template picker so no other project file needs to change.
let logoVisible = true;
const templateField = document.querySelector('.template-field');
const logoToggleField = document.createElement('div');
logoToggleField.className = 'field';
logoToggleField.style.cssText = 'flex-direction:row;align-items:center;gap:0.5rem;';
const logoToggleInput = document.createElement('input');
logoToggleInput.type = 'checkbox';
logoToggleInput.id = 'logoVisibleToggle';
logoToggleInput.checked = true;
logoToggleInput.style.cssText = 'width:1rem;height:1rem;accent-color:#1c1d1b;cursor:pointer;';
const logoToggleLabel = document.createElement('label');
logoToggleLabel.setAttribute('for', 'logoVisibleToggle');
logoToggleLabel.textContent = 'Show Logo';
logoToggleLabel.style.cssText =
  'font-family:"JetBrains Mono",ui-monospace,monospace;font-size:0.7rem;letter-spacing:0.08em;text-transform:uppercase;color:#6b6f66;cursor:pointer;';
logoToggleField.appendChild(logoToggleInput);
logoToggleField.appendChild(logoToggleLabel);
templateField.insertAdjacentElement('afterend', logoToggleField);

logoToggleInput.addEventListener('change', () => {
  logoVisible = logoToggleInput.checked;
  renderWatermarkPreview();
});

// ---- Custom logo upload ----
// Any uploaded PNG is auto-fitted (never cropped/stretched) into the
// same logo slot as the built-in brand badges, both on screen (CSS
// object-fit: contain) and in the exported canvas (aspect-fit math).
const customLogoBtn = document.getElementById('customLogoBtn');
const customLogoInput = document.getElementById('customLogoInput');
const customLogoPreview = document.getElementById('customLogoPreview');
const customLogoRemoveBtn = document.getElementById('customLogoRemoveBtn');
let customLogoImage = null;

function setCustomLogo(dataUrl) {
  const img = new Image();
  img.onload = () => {
    customLogoImage = img;
    customLogoPreview.src = dataUrl;
    customLogoPreview.hidden = false;
    customLogoRemoveBtn.hidden = false;
    customLogoBtn.textContent = 'Replace Logo';
    renderWatermarkPreview();
  };
  img.src = dataUrl;
}

function clearCustomLogo() {
  customLogoImage = null;
  customLogoPreview.src = '';
  customLogoPreview.hidden = true;
  customLogoRemoveBtn.hidden = true;
  customLogoBtn.textContent = 'Upload Logo';
  renderWatermarkPreview();
}

customLogoBtn.addEventListener('click', () => {
  customLogoInput.click();
});

customLogoInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  customLogoInput.value = '';
  if (!file) return;

  if (file.type !== 'image/png') {
    uploadAnnouncer.textContent = 'Custom logo must be a PNG file.';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => setCustomLogo(reader.result);
  reader.onerror = () => {
    uploadAnnouncer.textContent = 'Could not read the logo file — please try again.';
  };
  reader.readAsDataURL(file);
});

customLogoRemoveBtn.addEventListener('click', clearCustomLogo);

// Upload
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

// Editor panel
const editorBody = document.querySelector('.editor__body');
const editorStatus = document.querySelector('.editor__status');
const editorEmpty = document.getElementById('editorEmpty');
const metaForm = document.getElementById('metaForm');

const metaFields = {
  cameraBrand: document.getElementById('cameraBrand'),
  cameraModel: document.getElementById('cameraModel'),
  lens: document.getElementById('lens'),
  aperture: document.getElementById('aperture'),
  shutterSpeed: document.getElementById('shutterSpeed'),
  iso: document.getElementById('iso'),
  focalLength: document.getElementById('focalLength'),
  date: document.getElementById('date'),
  photographer: document.getElementById('photographer'),
  signature: document.getElementById('signature'),
};

// Export
const exportPngBtn = document.getElementById('exportPngBtn');
const exportJpegBtn = document.getElementById('exportJpegBtn');
const exportZipBtn = document.getElementById('exportZipBtn');
let currentFileName = '';

// Batch processing
const batchAddBtn = document.getElementById('batchAddBtn');
const batchFileInput = document.getElementById('batchFileInput');
const batchPanel = document.getElementById('batchPanel');
const batchList = document.getElementById('batchList');
const batchCount = document.getElementById('batchCount');
const batchClearBtn = document.getElementById('batchClearBtn');
const batchExportZipBtn = document.getElementById('batchExportZipBtn');
const batchProgress = document.getElementById('batchProgress');
let batchItems = [];
let batchIdCounter = 0;

// Accessibility announcer
const uploadAnnouncer = document.getElementById('uploadAnnouncer');

// Track the current object URL so it can be revoked on replace
let currentObjectUrl = null;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * ---- EXIF formatting helpers ----
 * Each returns a display-ready string, or '' if the raw value is missing.
 */

function formatAperture(fNumber) {
  if (!fNumber && fNumber !== 0) return '';
  const value = Number(fNumber);
  if (Number.isNaN(value)) return '';
  return `f/${Number(value.toFixed(1)).toString()}`;
}

function formatShutterSpeed(exposureTime) {
  if (!exposureTime && exposureTime !== 0) return '';
  const value = Number(exposureTime);
  if (Number.isNaN(value) || value <= 0) return '';

  if (value >= 1) {
    return `${Number(value.toFixed(1)).toString()}s`;
  }
  // Express fast exposures as a "1/x" fraction
  const denominator = Math.round(1 / value);
  return `1/${denominator}s`;
}

function formatIso(iso) {
  if (!iso && iso !== 0) return '';
  // ISOSpeedRatings can arrive as a number or a single-item array
  const value = Array.isArray(iso) ? iso[0] : iso;
  return value ? String(value) : '';
}

function formatFocalLength(focalLength) {
  if (!focalLength && focalLength !== 0) return '';
  const value = Number(focalLength);
  if (Number.isNaN(value)) return '';
  return `${Number(value.toFixed(1)).toString()}mm`;
}

function formatDate(dateTimeOriginal) {
  if (!dateTimeOriginal) return '';
  // EXIF dates look like "2024:06:03 14:22:10"
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(dateTimeOriginal);
  if (!match) return dateTimeOriginal;
  const [, year, month, day, time] = match;
  return `${year}-${month}-${day} ${time}`;
}

function formatLens(tags) {
  const lensModel = tags.LensModel || '';
  const lensMake = tags.LensMake || '';
  const combined = [lensMake, lensModel].filter(Boolean).join(' ').trim();
  return combined;
}

/**
 * ---- Templates ----
 * Four presets that restyle the same plate layout: colors, fonts,
 * and whether the logo mark / dividers appear. Used by the export
 * canvas; the live on-screen plate gets the same look via CSS rules
 * keyed on the matching data-template attribute.
 */
const TEMPLATE_STYLES = {
  hasselblad: {
    background: '#efebe2',
    topBar: '#e7b23b',
    topBarThin: false,
    ink: '#1c1d1b',
    inkMuted: '#6b6f66',
    divider: '#c9c3b4',
    logoRing: '#e7b23b',
    showLogo: true,
    showDividers: true,
    modelUppercase: true,
    modelItalic: false,
    modelFontFamily: '"Big Shoulders Condensed", "Inter", sans-serif',
    modelWeight: 700,
    specsWeight: 500,
    impliedBrand: 'Hasselblad',
    layout: ['id', 'logo', 'specs'],
  },
  canon: {
    background: '#ffffff',
    topBar: '#c8102e',
    topBarThin: false,
    ink: '#141414',
    inkMuted: '#6b6f66',
    divider: '#e2e2e2',
    logoRing: '#c8102e',
    showLogo: true,
    showDividers: true,
    modelUppercase: false,
    modelItalic: false,
    modelFontFamily: '"Inter", sans-serif',
    modelWeight: 700,
    specsWeight: 600,
    impliedBrand: 'Canon',
    layout: ['id', 'logo', 'specs'],
  },
  leica: {
    background: '#111110',
    topBar: '#e2001a',
    topBarThin: false,
    ink: '#f2efe6',
    inkMuted: '#a39d90',
    divider: '#3a3a38',
    logoRing: '#e2001a',
    showLogo: true,
    showDividers: true,
    modelUppercase: false,
    modelItalic: true,
    modelFontFamily: '"Big Shoulders Condensed", serif',
    modelWeight: 700,
    specsWeight: 500,
    impliedBrand: 'Leica',
    layout: ['id', 'logo', 'specs'],
  },
  minimal: {
    background: '#ffffff',
    topBar: '#e6e6e6',
    topBarThin: true,
    ink: '#1c1d1b',
    inkMuted: '#8b8d86',
    divider: 'transparent',
    logoRing: null,
    showLogo: false,
    showDividers: false,
    modelUppercase: false,
    modelItalic: false,
    modelFontFamily: '"Inter", sans-serif',
    modelWeight: 500,
    specsWeight: 400,
    impliedBrand: '',
    layout: ['id', 'logo', 'specs'],
  },
  nikon: {
    background: '#111111',
    topBar: '#ffe100',
    topBarThin: false,
    ink: '#ffffff',
    inkMuted: '#a6a6a6',
    divider: '#333333',
    logoRing: '#ffe100',
    showLogo: true,
    showDividers: true,
    modelUppercase: true,
    modelItalic: false,
    modelFontFamily: '"Inter", sans-serif',
    modelWeight: 700,
    specsWeight: 600,
    impliedBrand: 'Nikon',
    layout: ['id', 'logo', 'specs'],
  },
  sony: {
    background: '#ffffff',
    topBar: '#e2e2e2',
    topBarThin: true,
    ink: '#141414',
    inkMuted: '#6b6f66',
    divider: '#e2e2e2',
    logoRing: '#141414',
    showLogo: true,
    showDividers: true,
    modelUppercase: false,
    modelItalic: false,
    modelFontFamily: '"Inter", sans-serif',
    modelWeight: 600,
    specsWeight: 600,
    impliedBrand: 'Sony',
    layout: ['specs', 'logo', 'id'],
  },
  fujifilm: {
    background: '#f4f2ea',
    topBar: '#c8151c',
    topBarThin: false,
    ink: '#1c2a20',
    inkMuted: '#6b6f66',
    divider: '#d8d3c2',
    logoRing: '#c8151c',
    showLogo: true,
    showDividers: true,
    modelUppercase: false,
    modelItalic: false,
    modelFontFamily: '"Big Shoulders Condensed", "Inter", sans-serif',
    modelWeight: 700,
    specsWeight: 600,
    impliedBrand: 'Fujifilm',
    layout: ['logo', 'id', 'specs'],
  },
  gopro: {
    background: '#0d0d0d',
    topBar: '#ff5c00',
    topBarThin: false,
    ink: '#ffffff',
    inkMuted: '#b3b3b3',
    divider: '#333333',
    logoRing: '#ff5c00',
    showLogo: true,
    showDividers: true,
    modelUppercase: true,
    modelItalic: false,
    modelFontFamily: '"Big Shoulders Condensed", sans-serif',
    modelWeight: 700,
    specsWeight: 700,
    impliedBrand: 'GoPro',
    layout: ['logo', 'id', 'specs'],
  },
  dark: {
    background: '#1a1a1c',
    topBar: '#8f8f96',
    topBarThin: true,
    ink: '#f2f2f2',
    inkMuted: '#8f8f96',
    divider: '#33333a',
    logoRing: '#c9c9cf',
    showLogo: true,
    showDividers: true,
    modelUppercase: false,
    modelItalic: false,
    modelFontFamily: '"Inter", sans-serif',
    modelWeight: 600,
    specsWeight: 500,
    impliedBrand: '',
    layout: ['logo', 'id', 'specs'],
  },
};

/**
 * ---- Brand logos ----
 * Small colored monogram badges keyed by camera brand, detected
 * automatically from the "Camera Brand" field. Falls back to the
 * generic ring mark when the typed brand doesn't match a known one.
 */
const BRAND_LOGOS = [
  { key: 'canon', aliases: ['canon'], type: 'wordmark', text: 'Canon', color: '#c8102e', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, italic: true, uppercase: false, tracking: 0 },
  { key: 'nikon', aliases: ['nikon'], type: 'wordmark', text: 'Nikon', color: '#111111', fontFamily: 'Georgia, serif', fontWeight: 700, italic: true, uppercase: false, tracking: 0, box: '#ffe100' },
  { key: 'sony', aliases: ['sony'], type: 'wordmark', text: 'SONY', color: '#141414', fontFamily: '"Inter", sans-serif', fontWeight: 800, italic: false, uppercase: true, tracking: 0.14 },
  { key: 'leica', aliases: ['leica'], type: 'wordmark', text: 'LEICA', color: '#ffffff', fontFamily: '"Big Shoulders Condensed", sans-serif', fontWeight: 700, italic: false, uppercase: true, tracking: 0.03, box: '#e2001a' },
  { key: 'hasselblad', aliases: ['hasselblad'], type: 'wordmark', text: 'HASSELBLAD', color: '#e7b23b', fontFamily: '"Big Shoulders Condensed", sans-serif', fontWeight: 700, italic: false, uppercase: true, tracking: 0.09 },
  { key: 'fujifilm', aliases: ['fujifilm', 'fuji'], type: 'wordmark', text: 'FUJIFILM', color: '#c8151c', fontFamily: '"Inter", sans-serif', fontWeight: 800, italic: false, uppercase: true, tracking: 0.08 },
  { key: 'gopro', aliases: ['gopro'], type: 'wordmark', text: 'GoPro', color: '#ff5c00', fontFamily: '"Inter", sans-serif', fontWeight: 800, italic: false, uppercase: false, tracking: 0 },
  { key: 'panasonic', aliases: ['panasonic', 'lumix'], type: 'badge', initials: 'LM', color: '#0052a5', ink: '#ffffff' },
  { key: 'om-system', aliases: ['om system', 'olympus'], type: 'badge', initials: 'OM', color: '#00164d', ink: '#ffffff' },
  { key: 'dji', aliases: ['dji'], type: 'badge', initials: 'DJI', color: '#00b0ff', ink: '#ffffff' },
  { key: 'sigma', aliases: ['sigma'], type: 'badge', initials: 'SG', color: '#000000', ink: '#ffffff' },
  { key: 'pentax', aliases: ['pentax'], type: 'badge', initials: 'PK', color: '#8a6d1f', ink: '#ffffff' },
  { key: 'ricoh', aliases: ['ricoh', 'gr'], type: 'badge', initials: 'GR', color: '#d8232a', ink: '#ffffff' },
  { key: 'apple', aliases: ['apple', 'iphone'], type: 'badge', initials: 'AP', color: '#1d1d1f', ink: '#ffffff' },
  { key: 'pixel', aliases: ['pixel', 'google'], type: 'badge', initials: 'PX', color: '#1a73e8', ink: '#ffffff' },
  { key: 'samsung', aliases: ['samsung', 'galaxy'], type: 'badge', initials: 'SM', color: '#1428a0', ink: '#ffffff' },
  { key: 'xiaomi', aliases: ['xiaomi', 'redmi'], type: 'badge', initials: 'MI', color: '#ff6900', ink: '#ffffff' },
  { key: 'vivo', aliases: ['vivo'], type: 'badge', initials: 'VV', color: '#4b7bec', ink: '#ffffff' },
  { key: 'oppo', aliases: ['oppo'], type: 'badge', initials: 'OP', color: '#1bb974', ink: '#ffffff' },
  { key: 'realme', aliases: ['realme'], type: 'badge', initials: 'RM', color: '#fdc60b', ink: '#111111' },
  { key: 'huawei', aliases: ['huawei'], type: 'badge', initials: 'HW', color: '#c7000b', ink: '#ffffff' },
  { key: 'oneplus', aliases: ['oneplus', 'one plus'], type: 'badge', initials: '1+', color: '#eb0028', ink: '#ffffff' },
  { key: 'nothing', aliases: ['nothing'], type: 'badge', initials: 'NT', color: '#000000', ink: '#ffffff' },
];

function getBrandLogo(brandRaw) {
  const brand = (brandRaw || '').trim().toLowerCase();
  if (!brand) return null;
  return BRAND_LOGOS.find((entry) => entry.aliases.some((alias) => brand.includes(alias))) || null;
}

function resolveBrandLogo(typedBrand, templateKey) {
  const style = TEMPLATE_STYLES[templateKey] || TEMPLATE_STYLES.hasselblad;
  // A template IS a brand package (colors + layout + logo). If the chosen
  // template has its own identity, that identity always wins — so the
  // logo never ends up mismatched with the background/layout around it.
  if (style.impliedBrand) return getBrandLogo(style.impliedBrand);
  // Generic templates (Dark Mode / Minimal) have no fixed brand, so they
  // fall back to whatever camera brand was actually typed/read from EXIF.
  return getBrandLogo(typedBrand);
}

/**
 * ---- Live watermark rendering ----
 * Builds the individual display fields from the current form values.
 * The same field set drives both the on-screen plate (plain DOM text,
 * so it's always crisp and updates instantly) and the full-resolution
 * export (drawn onto a canvas below the image).
 */

function buildWatermarkLines() {
  const specs = [
    metaFields.aperture.value.trim(),
    metaFields.shutterSpeed.value.trim(),
    metaFields.iso.value.trim() ? `ISO ${metaFields.iso.value.trim()}` : '',
    metaFields.focalLength.value.trim(),
  ]
    .filter(Boolean)
    .join('   ·   ');

  const meta = [
    metaFields.date.value.trim(),
    metaFields.photographer.value.trim() ? `Photo: ${metaFields.photographer.value.trim()}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ');

  return {
    brand: metaFields.cameraBrand.value.trim(),
    model: metaFields.cameraModel.value.trim(),
    lens: metaFields.lens.value.trim(),
    specs,
    meta,
    signature: metaFields.signature.value.trim(),
  };
}

function hasAnyWatermarkContent(lines) {
  return Boolean(
    lines.brand || lines.model || lines.lens || lines.specs || lines.meta || lines.signature
  );
}

/**
 * Push the current field values straight into the on-screen plate.
 * Plain DOM text keeps it pixel-crisp and trivially "instant" —
 * no canvas redraw or layout math needed for the live preview.
 */
function renderWatermarkPreview() {
  const lines = buildWatermarkLines();

  if (!hasAnyWatermarkContent(lines) || previewImage.hidden) {
    wmPlate.hidden = true;
    return;
  }

  wmPlate.hidden = false;
  wmPlate.dataset.template = currentTemplate;

  wmLogoZone.style.display = logoVisible ? '' : 'none';

  const brandLogo = resolveBrandLogo(lines.brand, currentTemplate);
  if (customLogoImage) {
    wmRing.style.display = 'none';
    wmBrandBadge.style.display = 'none';
    wmCustomLogoChip.style.display = 'flex';
    wmCustomLogo.src = customLogoImage.src;
  } else if (brandLogo && brandLogo.type === 'wordmark') {
    wmRing.style.display = 'none';
    wmCustomLogoChip.style.display = 'none';
    wmBrandBadge.style.display = 'inline-flex';
    wmBrandBadge.textContent = brandLogo.text;
    wmBrandBadge.style.background = brandLogo.box || 'transparent';
    wmBrandBadge.style.color = brandLogo.box ? (brandLogo.color === '#ffffff' ? '#ffffff' : brandLogo.color) : brandLogo.color;
    wmBrandBadge.style.fontFamily = brandLogo.fontFamily;
    wmBrandBadge.style.fontWeight = String(brandLogo.fontWeight);
    wmBrandBadge.style.fontStyle = brandLogo.italic ? 'italic' : 'normal';
    wmBrandBadge.style.textTransform = brandLogo.uppercase ? 'uppercase' : 'none';
    wmBrandBadge.style.letterSpacing = `${brandLogo.tracking || 0}em`;
    wmBrandBadge.style.borderRadius = brandLogo.box ? '3px' : '0';
    wmBrandBadge.style.padding = brandLogo.box ? '0.15rem 0.35rem' : '0';
    wmBrandBadge.style.width = 'auto';
    wmBrandBadge.style.height = 'auto';
    wmBrandBadge.style.fontSize = '0.85rem';
    wmBrandBadge.style.lineHeight = '1';
    wmBrandBadge.style.whiteSpace = 'nowrap';
  } else if (brandLogo) {
    wmRing.style.display = 'none';
    wmCustomLogoChip.style.display = 'none';
    wmBrandBadge.style.display = 'flex';
    wmBrandBadge.style.width = '1.5rem';
    wmBrandBadge.style.height = '1.5rem';
    wmBrandBadge.style.borderRadius = '50%';
    wmBrandBadge.style.padding = '0';
    wmBrandBadge.style.fontFamily = '"JetBrains Mono", ui-monospace, monospace';
    wmBrandBadge.style.fontWeight = '700';
    wmBrandBadge.style.fontStyle = 'normal';
    wmBrandBadge.style.textTransform = 'none';
    wmBrandBadge.style.letterSpacing = '0.01em';
    wmBrandBadge.style.fontSize = '0.52rem';
    wmBrandBadge.style.background = brandLogo.color;
    wmBrandBadge.style.color = brandLogo.ink;
    wmBrandBadge.textContent = brandLogo.initials;
  } else {
    wmRing.style.display = '';
    wmBrandBadge.style.display = 'none';
    wmCustomLogoChip.style.display = 'none';
  }

  wmBrand.textContent = lines.brand || '—';
  wmModel.textContent = lines.model || '—';
  wmLens.textContent = lines.lens || '—';
  wmSpecs.textContent = lines.specs || '—';

  const metaWithSignature = [lines.meta, lines.signature].filter(Boolean).join('   ·   ');
  wmMeta.textContent = metaWithSignature || '—';
}

/**
 * Draw the watermark plate onto a 2D context as a bar of the given
 * width, positioned at (x, y). Mirrors the on-screen plate's layout:
 * logo | model + lens | aperture/shutter/iso/focal + date/photographer.
 * Every metric scales off the bar's width so it reads the same at
 * preview size or at full photo resolution. Returns the drawn height.
 */
/**
 * Scale (srcW × srcH) down/up to fit inside (maxW × maxH) without
 * cropping or distorting — the same "auto-fit" behavior as CSS
 * object-fit: contain, used so any uploaded logo (small or huge,
 * square or wide) always lands at a sensible size in its slot.
 */
function fitContain(srcW, srcH, maxW, maxH) {
  if (!srcW || !srcH) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / srcW, maxH / srcH);
  return { width: srcW * scale, height: srcH * scale };
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function measurePlateHeight(width) {
  const scale = width / 1600; // reference design width
  const pad = Math.max(22 * scale, 10);
  const gap = Math.max(16 * scale, 6);
  const fontModel = Math.max(30 * scale, 12);
  const fontLens = Math.max(15 * scale, 8);
  const fontSpecs = Math.max(20 * scale, 9);
  const fontMeta = Math.max(15 * scale, 8);
  return pad * 2 + Math.max(fontModel + fontLens + gap * 0.6, fontSpecs + fontMeta + gap * 0.6);
}

function drawWatermarkPlate(ctx, x, y, width, lines, templateKey, showLogo) {
  const style = TEMPLATE_STYLES[templateKey] || TEMPLATE_STYLES.hasselblad;
  const scale = width / 1600; // reference design width
  const pad = Math.max(22 * scale, 10);
  const gap = Math.max(16 * scale, 6);
  const segGap = Math.max(20 * scale, 10);

  const fontBrand = Math.max(12 * scale, 8);
  const fontModel = Math.max(30 * scale, 12);
  const fontLens = Math.max(15 * scale, 8);
  const fontSpecs = Math.max(20 * scale, 9);
  const fontMeta = Math.max(15 * scale, 8);

  const height = measurePlateHeight(width);
  const midY = y + height / 2;
  const brandLogo = resolveBrandLogo(lines.brand, templateKey);
  const layout = showLogo ? (style.layout || ['logo', 'id', 'specs']) : ['id', 'specs'];

  // Background plate + top accent line
  ctx.save();
  ctx.fillStyle = style.background;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = style.topBar;
  ctx.fillRect(x, y, width, style.topBarThin ? Math.max(1.5 * scale, 1) : Math.max(3 * scale, 2));

  // ---- Pass 1: measure the logo segment's natural width (real wordmark
  // logos vary a lot — "SONY" vs "HASSELBLAD" — so the slot must flex) ----
  const fontWordmark = Math.max(height * 0.28, 15);
  let wordmarkText = '';
  let logoWidth = Math.max(84 * scale, 46);
  if (showLogo) {
    if (customLogoImage) {
      logoWidth = Math.max(height * 0.85, 40);
    } else if (brandLogo && brandLogo.type === 'wordmark') {
      wordmarkText = brandLogo.uppercase ? brandLogo.text.toUpperCase() : brandLogo.text;
      if (brandLogo.tracking) {
        wordmarkText = wordmarkText
          .split('')
          .join(String.fromCharCode(8202).repeat(Math.round(brandLogo.tracking * 40)));
      }
      ctx.font = `${brandLogo.italic ? 'italic ' : ''}${brandLogo.fontWeight} ${fontWordmark}px ${brandLogo.fontFamily}`;
      const textWidth = ctx.measureText(wordmarkText).width;
      const boxPad = brandLogo.box ? Math.max(12 * scale, 6) * 2 : 0;
      logoWidth = Math.min(Math.max(textWidth + boxPad + pad * 0.6, 90 * scale), width * 0.4);
    }
  }

  // ---- Pass 2: split remaining width between the id (model+lens) and
  // specs (aperture/shutter/iso/focal + date) segments ----
  const dividerCount = layout.length - 1;
  const contentWidth = width - pad * 2 - dividerCount * segGap;
  const remaining = contentWidth - (showLogo ? logoWidth : 0);
  const idWidth = remaining * (showLogo ? 0.5 : 0.5);
  const specsWidth = remaining - idWidth;

  const segmentWidths = { logo: logoWidth, id: idWidth, specs: specsWidth };

  // ---- Draw each segment in the order the template's real-world layout uses ----
  let cursorX = x + pad;
  layout.forEach((segment, index) => {
    const segWidth = segmentWidths[segment];
    const segStart = cursorX;
    const segEnd = cursorX + segWidth;

    if (segment === 'logo') {
      const markCenterX = segStart + segWidth / 2;
      const markCenterY = midY;

      if (customLogoImage) {
        const boxSize = Math.max(height * 0.62, 30);
        const chipRadius = Math.max(4 * scale, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(ctx, markCenterX - boxSize / 2, markCenterY - boxSize / 2, boxSize, boxSize, chipRadius);
        ctx.fill();
        const fit = fitContain(customLogoImage.naturalWidth, customLogoImage.naturalHeight, boxSize * 0.8, boxSize * 0.8);
        ctx.drawImage(customLogoImage, markCenterX - fit.width / 2, markCenterY - fit.height / 2, fit.width, fit.height);
      } else if (brandLogo && brandLogo.type === 'wordmark') {
        ctx.font = `${brandLogo.italic ? 'italic ' : ''}${brandLogo.fontWeight} ${fontWordmark}px ${brandLogo.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textWidth = ctx.measureText(wordmarkText).width;

        if (brandLogo.box) {
          const boxPadX = Math.max(12 * scale, 6);
          const boxPadY = Math.max(7 * scale, 4);
          const boxW = textWidth + boxPadX * 2;
          const boxH = fontWordmark + boxPadY * 2;
          ctx.fillStyle = brandLogo.box;
          roundRect(ctx, markCenterX - boxW / 2, markCenterY - boxH / 2, boxW, boxH, Math.max(3 * scale, 2));
          ctx.fill();
        }

        ctx.fillStyle = brandLogo.color;
        ctx.fillText(wordmarkText, markCenterX, markCenterY + fontWordmark * 0.04);
      } else if (brandLogo) {
        const badgeRadius = Math.max(17 * scale, 8);
        ctx.fillStyle = brandLogo.color;
        ctx.beginPath();
        ctx.arc(markCenterX, markCenterY, badgeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `700 ${Math.max(11 * scale, 7)}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.fillStyle = brandLogo.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(brandLogo.initials, markCenterX, markCenterY + 0.5);
      } else {
        const ringRadius = Math.max(15 * scale, 7);
        ctx.strokeStyle = style.logoRing;
        ctx.lineWidth = Math.max(3 * scale, 1.5);
        ctx.beginPath();
        ctx.arc(markCenterX, markCenterY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = style.logoRing;
        ctx.beginPath();
        ctx.arc(markCenterX, markCenterY, ringRadius * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `500 ${fontBrand}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.fillStyle = style.inkMuted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText((lines.brand || '—').toUpperCase(), markCenterX, midY + ringRadius + fontBrand * 1.3, segWidth);
      }
    } else if (segment === 'id') {
      const modelText = style.modelUppercase ? (lines.model || '—').toUpperCase() : lines.model || '—';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${style.modelItalic ? 'italic ' : ''}${style.modelWeight} ${fontModel}px ${style.modelFontFamily}`;
      ctx.fillStyle = style.ink;
      ctx.fillText(modelText, segStart, midY - gap * 0.15, segWidth);

      ctx.font = `500 ${fontLens}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = style.inkMuted;
      ctx.fillText(lines.lens || '—', segStart, midY + fontLens + gap * 0.35, segWidth);
    } else if (segment === 'specs') {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${style.specsWeight} ${fontSpecs}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = style.ink;
      ctx.fillText(lines.specs || '—', segEnd, midY - gap * 0.15, segWidth);

      ctx.font = `500 ${fontMeta}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = style.inkMuted;
      const metaWithSignature = [lines.meta, lines.signature].filter(Boolean).join('   ·   ');
      ctx.fillText(metaWithSignature || '—', segEnd, midY + fontMeta + gap * 0.35, segWidth);
    }

    cursorX = segEnd;

    if (index < layout.length - 1) {
      if (style.showDividers) {
        const dividerX = cursorX + segGap / 2;
        ctx.strokeStyle = style.divider;
        ctx.lineWidth = Math.max(1 * scale, 1);
        ctx.beginPath();
        ctx.moveTo(dividerX, y + pad * 0.5);
        ctx.lineTo(dividerX, y + height - pad * 0.5);
        ctx.stroke();
      }
      cursorX += segGap;
    }
  });

  ctx.textAlign = 'left';
  ctx.restore();

  return height;
}

/**
 * Reset every metadata field to empty.
 */
function clearMetaFields() {
  Object.values(metaFields).forEach((input) => {
    input.value = '';
  });
}

/**
 * Read EXIF tags from the file and populate the editable fields.
 * Any tag that isn't present is simply left blank.
 */
function readExifIntoForm(file) {
  clearMetaFields();

  if (typeof EXIF === 'undefined') {
    uploadAnnouncer.textContent += ' EXIF library failed to load.';
    return;
  }

  EXIF.getData(file, function readTags() {
    const tags = this.exifdata || {};

    metaFields.cameraBrand.value = tags.Make ? tags.Make.trim() : '';
    metaFields.cameraModel.value = tags.Model ? tags.Model.trim() : '';
    metaFields.lens.value = formatLens(tags);
    metaFields.aperture.value = formatAperture(tags.FNumber);
    metaFields.shutterSpeed.value = formatShutterSpeed(tags.ExposureTime);
    metaFields.iso.value = formatIso(tags.ISOSpeedRatings);
    metaFields.focalLength.value = formatFocalLength(tags.FocalLength);
    metaFields.date.value = formatDate(tags.DateTimeOriginal || tags.DateTime);
    metaFields.photographer.value = tags.Artist ? tags.Artist.trim() : '';
    // Signature has no EXIF equivalent — left for the user to type.

    renderWatermarkPreview();
  });
}

/**
 * Load a File into the preview, replacing any existing image.
 */
function loadImageFile(file) {
  if (!file) return;

  if (!ACCEPTED_TYPES.includes(file.type)) {
    uploadAnnouncer.textContent = `"${file.name}" is not a supported image type.`;
    return;
  }

  // Replace: revoke the previous object URL before creating a new one
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(file);
  currentFileName = file.name;

  previewImage.src = currentObjectUrl;
  previewImage.alt = file.name;
  previewImage.hidden = false;
  previewEmptyState.hidden = true;
  viewfinder.classList.add('has-image');

  // Once natural dimensions are known, size the canvas and draw.
  previewImage.onload = () => {
    renderWatermarkPreview();
  };

  uploadBtn.textContent = 'Replace Photo';
  editorStatus.textContent = file.name;
  exportPngBtn.disabled = false;
  exportJpegBtn.disabled = false;
  exportZipBtn.disabled = false;

  editorEmpty.hidden = true;
  metaForm.hidden = false;
  readExifIntoForm(file);

  uploadAnnouncer.textContent = `"${file.name}" loaded.`;
}

// ---- Instant updates: refresh the watermark plate on every keystroke ----
let renderPreviewRaf = null;
function scheduleRenderWatermarkPreview() {
  if (renderPreviewRaf) return;
  renderPreviewRaf = requestAnimationFrame(() => {
    renderPreviewRaf = null;
    renderWatermarkPreview();
  });
}
metaForm.addEventListener('input', scheduleRenderWatermarkPreview);

// ---- Template picker: switch styles instantly, no page reload ----
templateButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.template === currentTemplate) return;
    currentTemplate = btn.dataset.template;
    templateButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('is-active', isActive);
      b.setAttribute('aria-checked', String(isActive));
    });
    renderWatermarkPreview();
  });
});

// ---- Upload button -> hidden file input ----
uploadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  loadImageFile(file);
  // Reset value so selecting the same file again still fires "change"
  fileInput.value = '';
});

// ---- Drag & drop onto the viewfinder ----
let dragCounter = 0;

viewfinder.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragCounter += 1;
  viewfinder.classList.add('is-dragover');
});

viewfinder.addEventListener('dragover', (event) => {
  // Required to allow dropping
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

viewfinder.addEventListener('dragleave', () => {
  dragCounter -= 1;
  if (dragCounter <= 0) {
    dragCounter = 0;
    viewfinder.classList.remove('is-dragover');
  }
});

viewfinder.addEventListener('drop', (event) => {
  event.preventDefault();
  dragCounter = 0;
  viewfinder.classList.remove('is-dragover');

  const [file] = event.dataTransfer.files;
  loadImageFile(file);
});

// Prevent the browser from navigating away if a file is dropped
// outside the viewfinder (e.g. elsewhere on the page).
['dragover', 'drop'].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    if (!viewfinder.contains(event.target)) {
      event.preventDefault();
    }
  });
});

// ---- Export: bake the watermark plate below the image on a full-resolution canvas ----
function renderWatermarkedCanvas(format) {
  const lines = buildWatermarkLines();
  const includePlate = hasAnyWatermarkContent(lines);

  const imgWidth = previewImage.naturalWidth;
  const imgHeight = previewImage.naturalHeight;
  const plateHeight = includePlate ? Math.round(measurePlateHeight(imgWidth)) : 0;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = imgWidth;
  exportCanvas.height = imgHeight + plateHeight;
  const exportCtx = exportCanvas.getContext('2d');

  if (format === 'jpeg') {
    // JPEG has no alpha channel — flatten onto white first.
    exportCtx.fillStyle = '#ffffff';
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  exportCtx.drawImage(previewImage, 0, 0, imgWidth, imgHeight);

  if (includePlate) {
    drawWatermarkPlate(exportCtx, 0, imgHeight, imgWidth, lines, currentTemplate, logoVisible);
  }

  return exportCanvas;
}

function watermarkedBlob(format) {
  const exportCanvas = renderWatermarkedCanvas(format);
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    exportCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      mimeType,
      format === 'jpeg' ? 0.92 : undefined
    );
  });
}

function exportWatermarkedImage(format) {
  if (!previewImage.naturalWidth) return;

  const extension = format === 'jpeg' ? 'jpg' : 'png';

  watermarkedBlob(format)
    .then((blob) => {
      const downloadUrl = URL.createObjectURL(blob);
      const baseName = currentFileName.replace(/\.[^./]+$/, '') || 'photo';
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${baseName}-watermarked.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      uploadAnnouncer.textContent = 'Watermarked photo exported.';
    })
    .catch(() => {
      uploadAnnouncer.textContent = 'Export failed — please try again.';
    });
}

let jszipLoadPromise = null;
function loadJSZip() {
  if (typeof JSZip !== 'undefined') return Promise.resolve();
  if (jszipLoadPromise) return jszipLoadPromise;

  jszipLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => resolve();
    script.onerror = () => {
      jszipLoadPromise = null;
      reject(new Error('Failed to load JSZip'));
    };
    document.head.appendChild(script);
  });

  return jszipLoadPromise;
}

async function exportWatermarkedZip() {
  if (!previewImage.naturalWidth) return;

  exportZipBtn.disabled = true;
  uploadAnnouncer.textContent = 'Building ZIP…';

  try {
    await loadJSZip();
    const baseName = currentFileName.replace(/\.[^./]+$/, '') || 'photo';
    const [pngBlob, jpegBlob] = await Promise.all([
      watermarkedBlob('png'),
      watermarkedBlob('jpeg'),
    ]);

    const zip = new JSZip();
    zip.file(`${baseName}-watermarked.png`, pngBlob);
    zip.file(`${baseName}-watermarked.jpg`, jpegBlob);
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const downloadUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${baseName}-watermarked.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    uploadAnnouncer.textContent = 'ZIP exported.';
  } catch (err) {
    uploadAnnouncer.textContent = 'ZIP export failed — please try again.';
  } finally {
    exportZipBtn.disabled = false;
  }
}

exportPngBtn.addEventListener('click', () => exportWatermarkedImage('png'));
exportJpegBtn.addEventListener('click', () => exportWatermarkedImage('jpeg'));
exportZipBtn.addEventListener('click', () => exportWatermarkedZip());


// ============================================================
// ---- Batch Processing ----
// Queue several photos, then render + export them all at once
// using the currently selected template/logo/photographer/
// signature, while each photo's own EXIF drives its camera fields.
// ============================================================

function readExifAsync(file) {
  return new Promise((resolve) => {
    if (typeof EXIF === 'undefined') {
      resolve({});
      return;
    }
    EXIF.getData(file, function readTags() {
      resolve(this.exifdata || {});
    });
  });
}

function buildWatermarkLinesFromTags(tags) {
  const specs = [
    formatAperture(tags.FNumber),
    formatShutterSpeed(tags.ExposureTime),
    formatIso(tags.ISOSpeedRatings) ? `ISO ${formatIso(tags.ISOSpeedRatings)}` : '',
    formatFocalLength(tags.FocalLength),
  ]
    .filter(Boolean)
    .join('   ·   ');

  const globalPhotographer = metaFields.photographer.value.trim();
  const globalSignature = metaFields.signature.value.trim();

  const meta = [
    formatDate(tags.DateTimeOriginal || tags.DateTime),
    globalPhotographer ? `Photo: ${globalPhotographer}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ');

  return {
    brand: tags.Make ? tags.Make.trim() : '',
    model: tags.Model ? tags.Model.trim() : '',
    lens: formatLens(tags),
    specs,
    meta,
    signature: globalSignature,
  };
}

function renderBatchList() {
  batchCount.textContent = String(batchItems.length);
  batchPanel.hidden = batchItems.length === 0;
  batchExportZipBtn.disabled = batchItems.length === 0;

  batchList.innerHTML = '';
  batchItems.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'batch-item';

    const thumb = document.createElement('img');
    thumb.className = 'batch-item__thumb';
    thumb.src = item.objectUrl;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';

    const name = document.createElement('span');
    name.className = 'batch-item__name';
    name.textContent = item.file.name;

    const status = document.createElement('span');
    status.className = 'batch-item__status';
    if (item.status === 'done') status.classList.add('is-done');
    if (item.status === 'error') status.classList.add('is-error');
    status.textContent = item.status;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'batch-item__remove';
    removeBtn.setAttribute('aria-label', `Remove ${item.file.name}`);
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeBatchItem(item.id));

    li.append(thumb, name, status, removeBtn);
    batchList.appendChild(li);
  });
}

function addFilesToBatch(fileList) {
  Array.from(fileList)
    .filter((file) => ACCEPTED_TYPES.includes(file.type))
    .forEach((file) => {
      batchIdCounter += 1;
      batchItems.push({
        id: batchIdCounter,
        file,
        objectUrl: URL.createObjectURL(file),
        status: 'pending',
      });
    });
  renderBatchList();
}

function removeBatchItem(id) {
  const item = batchItems.find((entry) => entry.id === id);
  if (item) URL.revokeObjectURL(item.objectUrl);
  batchItems = batchItems.filter((entry) => entry.id !== id);
  renderBatchList();
}

function clearBatch() {
  batchItems.forEach((item) => URL.revokeObjectURL(item.objectUrl));
  batchItems = [];
  renderBatchList();
  batchProgress.textContent = '';
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function processBatchItem(item, format) {
  const tags = await readExifAsync(item.file);
  const img = await loadImageElement(item.objectUrl);

  const lines = buildWatermarkLinesFromTags(tags);
  const includePlate = hasAnyWatermarkContent(lines);

  const imgWidth = img.naturalWidth;
  const imgHeight = img.naturalHeight;
  const plateHeight = includePlate ? Math.round(measurePlateHeight(imgWidth)) : 0;

  const canvas = document.createElement('canvas');
  canvas.width = imgWidth;
  canvas.height = imgHeight + plateHeight;
  const ctx = canvas.getContext('2d');

  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

  if (includePlate) {
    drawWatermarkPlate(ctx, 0, imgHeight, imgWidth, lines, currentTemplate, logoVisible);
  }

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      mimeType,
      format === 'jpeg' ? 0.92 : undefined
    );
  });
}

async function exportBatchAsZip() {
  if (!batchItems.length) return;

  batchExportZipBtn.disabled = true;
  await loadJSZip();
  const zip = new JSZip();
  let done = 0;

  for (const item of batchItems) {
    batchProgress.textContent = `Processing ${done + 1} / ${batchItems.length}…`;
    try {
      const blob = await processBatchItem(item, 'jpeg');
      const baseName = item.file.name.replace(/\.[^./]+$/, '') || 'photo';
      zip.file(`${baseName}-watermarked.jpg`, blob);
      item.status = 'done';
    } catch (err) {
      item.status = 'error';
    }
    done += 1;
    renderBatchList();
  }

  batchProgress.textContent = 'Zipping…';
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'watermarked-photos.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);

  batchProgress.textContent = `Done — ${done} photo${done === 1 ? '' : 's'} exported.`;
  batchExportZipBtn.disabled = false;
}

batchAddBtn.addEventListener('click', () => {
  batchFileInput.click();
});

batchFileInput.addEventListener('change', (event) => {
  addFilesToBatch(event.target.files);
  batchFileInput.value = '';
});

batchClearBtn.addEventListener('click', clearBatch);
batchExportZipBtn.addEventListener('click', () => exportBatchAsZip());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline/PWA support simply won't be available; the app still works online.
    });
  });
}

// ---- Offline mode: reflect connectivity state in the UI ----
const offlineBanner = document.getElementById('offlineBanner');

function updateOnlineStatus() {
  offlineBanner.hidden = navigator.onLine;
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();
