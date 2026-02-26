/**
 * Compose multiple exported section images into a single pipeline diagram.
 *
 * The pipeline has two rows:
 *   Row 1:  [A] Config  →  [B] 3D Visualization  →  [C] Results
 *   Row 2:          [D] Connection Details (centered, full width)
 *
 * Each section has a circled step letter and a connecting arrow.
 * A single "Export Pipeline" button captures all 4 refs and builds
 * this diagram entirely on a client-side <canvas>.
 */

const PADDING = 40;
const GAP = 60; // horizontal gap between cards
const ROW_GAP = 60; // vertical gap between rows
const STEP_RADIUS = 22;
const ARROW_LENGTH = GAP; // arrow sits inside the gap
const LABEL_FONT = "bold 18px Inter, system-ui, sans-serif";
const TITLE_FONT = "bold 24px Inter, system-ui, sans-serif";

interface PipelineOptions {
	title?: string;
	filename?: string;
	backgroundColor?: string;
}

/**
 * Draw a single step label (circled letter + text) above an image on the
 * compositing canvas.
 */
function drawStepLabel(
	ctx: CanvasRenderingContext2D,
	letter: string,
	label: string,
	cx: number,
	cy: number,
) {
	// Circled letter
	ctx.beginPath();
	ctx.arc(cx, cy, STEP_RADIUS, 0, Math.PI * 2);
	ctx.fillStyle = "#3b82f6";
	ctx.fill();
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 16px Inter, system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(letter, cx, cy);

	// Label text to the right of the circle
	ctx.fillStyle = "#374151";
	ctx.font = LABEL_FONT;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillText(label, cx + STEP_RADIUS + 10, cy);
}

/**
 * Draw a right-pointing arrow between two cards.
 */
function drawArrow(
	ctx: CanvasRenderingContext2D,
	fromX: number,
	y: number,
	length: number,
) {
	const headLen = 12;
	const toX = fromX + length;

	ctx.strokeStyle = "#6b7280";
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(fromX, y);
	ctx.lineTo(toX, y);
	ctx.stroke();

	// Arrowhead
	ctx.fillStyle = "#6b7280";
	ctx.beginPath();
	ctx.moveTo(toX, y);
	ctx.lineTo(toX - headLen, y - headLen / 2);
	ctx.lineTo(toX - headLen, y + headLen / 2);
	ctx.closePath();
	ctx.fill();
}

/**
 * Draw a down-pointing arrow from the top row to the bottom row.
 */
function drawDownArrow(
	ctx: CanvasRenderingContext2D,
	x: number,
	fromY: number,
	length: number,
) {
	const headLen = 12;
	const toY = fromY + length;

	ctx.strokeStyle = "#6b7280";
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(x, fromY);
	ctx.lineTo(x, toY);
	ctx.stroke();

	// Arrowhead
	ctx.fillStyle = "#6b7280";
	ctx.beginPath();
	ctx.moveTo(x, toY);
	ctx.lineTo(x - headLen / 2, toY - headLen);
	ctx.lineTo(x + headLen / 2, toY - headLen);
	ctx.closePath();
	ctx.fill();
}

/**
 * Load an <img> from a data URL or blob URL.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

/**
 * Capture a DOM element as a data-URL using html-to-image,
 * then return it as an HTMLImageElement with its natural dimensions.
 */
async function captureElement(
	element: HTMLElement,
): Promise<{ img: HTMLImageElement; w: number; h: number }> {
	const { toPng } = await import("html-to-image");
	const dataUrl = await toPng(element, {
		pixelRatio: 2,
		backgroundColor: "#ffffff",
		filter: (node: HTMLElement) => !node?.dataset?.exportExclude,
	});
	const img = await loadImage(dataUrl);
	return { img, w: img.naturalWidth, h: img.naturalHeight };
}

/**
 * Capture the Three.js canvas at high resolution and return as image.
 */
async function captureCanvas(
	gl: any,
	scene: any,
	camera: any,
	multiplier = 2,
): Promise<{ img: HTMLImageElement; w: number; h: number }> {
	const w = gl.domElement.width;
	const h = gl.domElement.height;
	const tw = w * multiplier;
	const th = h * multiplier;

	const prevW = gl.domElement.width;
	const prevH = gl.domElement.height;
	const prevSW = gl.domElement.style.width;
	const prevSH = gl.domElement.style.height;

	try {
		gl.setSize(tw, th, false);
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

/**
 * Main export function – captures all 4 sections and composes them
 * into a single pipeline PNG.
 *
 * @param configRef   Ref to the Solver Configuration card (HTMLDivElement)
 * @param canvasRef   Ref exposing { gl, scene, camera } from Three.js
 * @param resultsRef  Ref to the Results card (HTMLDivElement)
 * @param connectionRef Ref to the Connection Details card (HTMLDivElement)
 * @param options     Optional title, filename, background colour
 */
export async function exportPipelineImage(
	configRef: HTMLElement | null,
	canvasRef: { gl: any; scene: any; camera: any } | null,
	resultsRef: HTMLElement | null,
	connectionRef: HTMLElement | null,
	options: PipelineOptions = {},
): Promise<void> {
	const {
		title = "Protein Folding Solver Pipeline",
		filename = "protein-visualizer-pipeline",
		backgroundColor = "#f9fafb",
	} = options;

	if (!configRef || !canvasRef || !resultsRef || !connectionRef) {
		console.error("Pipeline export: one or more refs are null");
		return;
	}

	// 1. Capture all four sections in parallel
	const [config, vis, results, connection] = await Promise.all([
		captureElement(configRef),
		captureCanvas(canvasRef.gl, canvasRef.scene, canvasRef.camera),
		captureElement(resultsRef),
		captureElement(connectionRef),
	]);

	// 2. Normalize heights for the top row – scale to the tallest card
	const LABEL_HEIGHT = 50; // space for step label above each card
	const topTargetH = Math.max(config.h, vis.h, results.h);

	function scaleToH(
		item: { img: HTMLImageElement; w: number; h: number },
		targetH: number,
	) {
		const scale = targetH / item.h;
		return { ...item, drawW: item.w * scale, drawH: targetH };
	}

	const cS = scaleToH(config, topTargetH);
	const vS = scaleToH(vis, topTargetH);
	const rS = scaleToH(results, topTargetH);

	// Top row total width (3 cards + 2 arrows)
	const topRowW = cS.drawW + GAP + vS.drawW + GAP + rS.drawW;

	// Connection details – scale to fit full top-row width
	const connScale = topRowW / connection.w;
	const connDrawW = topRowW;
	const connDrawH = connection.h * connScale;

	// 3. Canvas dimensions
	const canvasW = PADDING * 2 + topRowW;
	const titleHeight = 60;
	const topRowY = PADDING + titleHeight + LABEL_HEIGHT;
	const arrowDownLen = ROW_GAP - 10;
	const bottomRowY =
		topRowY + topTargetH + arrowDownLen + LABEL_HEIGHT;
	const canvasH = bottomRowY + connDrawH + PADDING;

	// 4. Create canvas
	const canvas = document.createElement("canvas");
	canvas.width = canvasW;
	canvas.height = canvasH;
	const ctx = canvas.getContext("2d")!;

	// Background
	ctx.fillStyle = backgroundColor;
	ctx.fillRect(0, 0, canvasW, canvasH);

	// Title
	ctx.fillStyle = "#111827";
	ctx.font = TITLE_FONT;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(title, canvasW / 2, PADDING + titleHeight / 2);

	// 5. Draw top row
	const x1 = PADDING;
	const x2 = x1 + cS.drawW + GAP;
	const x3 = x2 + vS.drawW + GAP;

	// Step labels
	drawStepLabel(ctx, "A", "Solver Configuration", x1 + 10, topRowY - LABEL_HEIGHT / 2);
	drawStepLabel(ctx, "B", "3D Visualization", x2 + 10, topRowY - LABEL_HEIGHT / 2);
	drawStepLabel(ctx, "C", "Results", x3 + 10, topRowY - LABEL_HEIGHT / 2);

	// Card images
	ctx.drawImage(cS.img, x1, topRowY, cS.drawW, cS.drawH);
	ctx.drawImage(vS.img, x2, topRowY, vS.drawW, vS.drawH);
	ctx.drawImage(rS.img, x3, topRowY, rS.drawW, rS.drawH);

	// Card borders
	ctx.strokeStyle = "#e5e7eb";
	ctx.lineWidth = 2;
	ctx.strokeRect(x1, topRowY, cS.drawW, cS.drawH);
	ctx.strokeRect(x2, topRowY, vS.drawW, vS.drawH);
	ctx.strokeRect(x3, topRowY, rS.drawW, rS.drawH);

	// Arrows between top cards
	const arrowY1 = topRowY + topTargetH / 2;
	drawArrow(ctx, x1 + cS.drawW, arrowY1, GAP);
	drawArrow(ctx, x2 + vS.drawW, arrowY1, GAP);

	// Down arrow from results to connection table
	const downArrowX = x1 + topRowW / 2;
	drawDownArrow(ctx, downArrowX, topRowY + topTargetH, arrowDownLen);

	// 6. Draw bottom row
	drawStepLabel(
		ctx,
		"D",
		"Connection Details",
		x1 + 10,
		bottomRowY - LABEL_HEIGHT / 2,
	);
	ctx.drawImage(connection.img, x1, bottomRowY, connDrawW, connDrawH);
	ctx.strokeStyle = "#e5e7eb";
	ctx.lineWidth = 2;
	ctx.strokeRect(x1, bottomRowY, connDrawW, connDrawH);

	// 7. Download
	const dataUrl = canvas.toDataURL("image/png");
	const link = document.createElement("a");
	link.download = `${filename}.png`;
	link.href = dataUrl;
	link.click();
}
