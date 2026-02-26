/**
 * Compose multiple exported section images into a single pipeline diagram
 * optimised for inclusion in a **scientific article / journal figure**.
 *
 * Layout (2 × 2 grid with flow arrows):
 *
 *   (a) Solver Configuration  ──→  (b) 3D Visualization
 *            │                              │
 *            ↓                              ↓
 *   (c) Energy Evolution      ←──  (d) Connection Details
 *
 * The figure targets ~2000 px wide which maps to a comfortable single-
 * or two-column figure at 300 DPI (≈17 cm / 6.7 in).
 */

const PADDING = 48;
const GAP = 56; // gap between cells (contains arrows)
const LABEL_FONT = "bold 13px 'Times New Roman', 'Noto Serif', Georgia, serif";
const TITLE_FONT = "bold 16px 'Times New Roman', 'Noto Serif', Georgia, serif";
const CAPTION_FONT = "italic 12px 'Times New Roman', 'Noto Serif', Georgia, serif";

interface PipelineOptions {
	title?: string;
	filename?: string;
	backgroundColor?: string;
	caption?: string;
}

// ─── Drawing helpers ─────────────────────────────────────────────────

function drawSubLabel(
	ctx: CanvasRenderingContext2D,
	label: string,
	x: number,
	y: number,
) {
	ctx.fillStyle = "#111827";
	ctx.font = LABEL_FONT;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(label, x, y);
}

function drawHorizArrow(
	ctx: CanvasRenderingContext2D,
	x1: number,
	y: number,
	x2: number,
) {
	const head = 10;
	ctx.strokeStyle = "#374151";
	ctx.lineWidth = 2;
	ctx.setLineDash([]);
	ctx.beginPath();
	ctx.moveTo(x1, y);
	ctx.lineTo(x2, y);
	ctx.stroke();
	ctx.fillStyle = "#374151";
	ctx.beginPath();
	ctx.moveTo(x2, y);
	ctx.lineTo(x2 - head, y - head / 2);
	ctx.lineTo(x2 - head, y + head / 2);
	ctx.closePath();
	ctx.fill();
}

function drawVertArrow(
	ctx: CanvasRenderingContext2D,
	x: number,
	y1: number,
	y2: number,
) {
	const head = 10;
	ctx.strokeStyle = "#374151";
	ctx.lineWidth = 2;
	ctx.setLineDash([]);
	ctx.beginPath();
	ctx.moveTo(x, y1);
	ctx.lineTo(x, y2);
	ctx.stroke();
	ctx.fillStyle = "#374151";
	ctx.beginPath();
	ctx.moveTo(x, y2);
	ctx.lineTo(x - head / 2, y2 - head);
	ctx.lineTo(x + head / 2, y2 - head);
	ctx.closePath();
	ctx.fill();
}

// ─── Image loading ──────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

/** Expand scroll/overflow constraints, capture, restore. */
async function captureElement(
	element: HTMLElement,
): Promise<{ img: HTMLImageElement; w: number; h: number }> {
	const saved: { el: HTMLElement; mh: string; ov: string; ovy: string }[] = [];
	let anc: HTMLElement | null = element;
	while (anc) {
		const s = anc.style;
		const c = getComputedStyle(anc);
		if (
			c.overflow !== "visible" ||
			c.overflowY !== "visible" ||
			(c.maxHeight && c.maxHeight !== "none")
		) {
			saved.push({ el: anc, mh: s.maxHeight, ov: s.overflow, ovy: s.overflowY });
			s.maxHeight = "none";
			s.overflow = "visible";
			s.overflowY = "visible";
		}
		anc = anc.parentElement;
	}
	try {
		const { toPng } = await import("html-to-image");
		const dataUrl = await toPng(element, {
			pixelRatio: 2,
			backgroundColor: "#ffffff",
			filter: (node: HTMLElement) => !node?.dataset?.exportExclude,
		});
		const img = await loadImage(dataUrl);
		return { img, w: img.naturalWidth, h: img.naturalHeight };
	} finally {
		for (const { el, mh, ov, ovy } of saved) {
			el.style.maxHeight = mh;
			el.style.overflow = ov;
			el.style.overflowY = ovy;
		}
	}
}

async function captureCanvas(
	gl: any,
	scene: any,
	camera: any,
	multiplier = 2,
): Promise<{ img: HTMLImageElement; w: number; h: number }> {
	const prevW = gl.domElement.width;
	const prevH = gl.domElement.height;
	const prevSW = gl.domElement.style.width;
	const prevSH = gl.domElement.style.height;
	try {
		gl.setSize(prevW * multiplier, prevH * multiplier, false);
		gl.render(scene, camera);
		const dataUrl = gl.domElement.toDataURL("image/png");
		const img = await loadImage(dataUrl);
		return { img, w: img.naturalWidth, h: img.naturalHeight };
	} finally {
		gl.setSize(prevW, prevH, false);
		gl.domElement.style.width = prevSW;
		gl.domElement.style.height = prevSH;
		gl.render(scene, camera);
	}
}

// ─── Main export ────────────────────────────────────────────────────

export async function exportPipelineImage(
	configRef: HTMLElement | null,
	canvasRef: { gl: any; scene: any; camera: any } | null,
	resultsRef: HTMLElement | null,
	connectionRef: HTMLElement | null,
	options: PipelineOptions = {},
): Promise<void> {
	const {
		title = "Fig. 1. Protein Folding Solver Pipeline",
		filename = "protein-visualizer-pipeline",
		backgroundColor = "#ffffff",
		caption,
	} = options;

	if (!configRef || !canvasRef || !resultsRef || !connectionRef) {
		console.error("Pipeline export: one or more refs are null");
		return;
	}

	// 1. Capture all four sections
	const [config, vis, results, connection] = await Promise.all([
		captureElement(configRef),
		captureCanvas(canvasRef.gl, canvasRef.scene, canvasRef.camera),
		captureElement(resultsRef),
		captureElement(connectionRef),
	]);

	// 2. Compute grid cell sizes
	//    Each cell is half the usable width minus the gap.
	const LABEL_H = 24; // height for "(a) ..." label
	const TARGET_W = 2000; // total figure width in px
	const usableW = TARGET_W - PADDING * 2 - GAP;
	const cellW = usableW / 2; // each cell is half

	// Scale each image to fit cellW, preserving aspect ratio
	const scaleToFit = (item: { w: number; h: number }) => {
		const s = cellW / item.w;
		return { drawW: cellW, drawH: item.h * s };
	};

	const aSize = scaleToFit(config);
	const bSize = scaleToFit(vis);
	const cSize = scaleToFit(results);
	const dSize = scaleToFit(connection);

	// Row heights = max of the two cells in each row (+ label)
	const row1H = Math.max(aSize.drawH, bSize.drawH);
	const row2H = Math.max(cSize.drawH, dSize.drawH);

	// 3. Total canvas dimensions
	const titleH = 40;
	const captionH = caption ? 36 : 0;
	const totalH =
		PADDING + titleH +
		LABEL_H + row1H + GAP +
		LABEL_H + row2H +
		captionH + PADDING;

	const canvas = document.createElement("canvas");
	canvas.width = TARGET_W;
	canvas.height = totalH;
	const ctx = canvas.getContext("2d")!;

	// Background
	ctx.fillStyle = backgroundColor;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// 4. Title (top, centered, bold serif)
	ctx.fillStyle = "#111827";
	ctx.font = TITLE_FONT;
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	ctx.fillText(title, TARGET_W / 2, PADDING);

	// Coordinates for the 2×2 grid
	const x1 = PADDING; // left column
	const x2 = PADDING + cellW + GAP; // right column
	const y1 = PADDING + titleH; // top row (label starts here)
	const y2 = y1 + LABEL_H + row1H + GAP; // bottom row

	// 5. Draw labels and images
	// (a) Solver Configuration — top-left
	drawSubLabel(ctx, "(a) Solver Configuration", x1, y1);
	ctx.drawImage(config.img, x1, y1 + LABEL_H, aSize.drawW, aSize.drawH);
	ctx.strokeStyle = "#d1d5db";
	ctx.lineWidth = 1;
	ctx.strokeRect(x1, y1 + LABEL_H, aSize.drawW, aSize.drawH);

	// (b) 3D Visualization — top-right
	drawSubLabel(ctx, "(b) 3D Visualization", x2, y1);
	ctx.drawImage(vis.img, x2, y1 + LABEL_H, bSize.drawW, bSize.drawH);
	ctx.strokeStyle = "#d1d5db";
	ctx.strokeRect(x2, y1 + LABEL_H, bSize.drawW, bSize.drawH);

	// (c) Results — bottom-left
	drawSubLabel(ctx, "(c) Energy Evolution", x1, y2);
	ctx.drawImage(results.img, x1, y2 + LABEL_H, cSize.drawW, cSize.drawH);
	ctx.strokeStyle = "#d1d5db";
	ctx.strokeRect(x1, y2 + LABEL_H, cSize.drawW, cSize.drawH);

	// (d) Connection Details — bottom-right
	drawSubLabel(ctx, "(d) Connection Details", x2, y2);
	ctx.drawImage(connection.img, x2, y2 + LABEL_H, dSize.drawW, dSize.drawH);
	ctx.strokeStyle = "#d1d5db";
	ctx.strokeRect(x2, y2 + LABEL_H, dSize.drawW, dSize.drawH);

	// 6. Flow arrows
	// (a) → (b)  horizontal arrow between top cells
	const arrowY1 = y1 + LABEL_H + row1H / 2;
	drawHorizArrow(ctx, x1 + cellW + 4, arrowY1, x2 - 4);

	// (a) ↓ (c)  vertical arrow between left cells
	const arrowX1 = x1 + cellW / 2;
	drawVertArrow(ctx, arrowX1, y1 + LABEL_H + row1H + 4, y2 + LABEL_H - 4);

	// (b) ↓ (d)  vertical arrow between right cells
	const arrowX2 = x2 + cellW / 2;
	drawVertArrow(ctx, arrowX2, y1 + LABEL_H + row1H + 4, y2 + LABEL_H - 4);

	// 7. Optional caption
	if (caption) {
		ctx.fillStyle = "#4b5563";
		ctx.font = CAPTION_FONT;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		ctx.fillText(caption, TARGET_W / 2, totalH - PADDING / 2);
	}

	// 8. Download
	const dataUrl = canvas.toDataURL("image/png");
	const link = document.createElement("a");
	link.download = `${filename}.png`;
	link.href = dataUrl;
	link.click();
}
