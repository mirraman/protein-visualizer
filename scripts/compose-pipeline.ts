/**
 * Compose the 4 exported PNGs into a compact horizontal pipeline.
 *
 * Layout:  [Config] → [3D] → [Results] → [Connections]
 *
 * - No text, no title, no caption — just images and arrows.
 * - Transparent background so it drops into any document cleanly.
 * - All images scaled to the same height for a tight, uniform strip.
 *
 * Usage:  npm run pipeline
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const loadImg = (p: string) => loadImage(readFileSync(p));

// ─── Configuration ──────────────────────────────────────────────────
const ASSETS = join(process.cwd(), "assets");

const INPUT = {
	config: join(ASSETS, "solver-config-monte-carlo.png"),
	vis: join(ASSETS, "protein-3d-visualization-monte-carlo.png"),
	results: join(ASSETS, "solver-results-monte-carlo.png"),
	connection: join(ASSETS, "connection-details-monte-carlo.png"),
};

const OUTPUT = join(ASSETS, "pipeline-monte-carlo.png");

const ARROW_GAP = 48;   // space between images (arrow lives here)
const PADDING = 16;   // small outer padding
const ROW_H = 800;  // target height per image (px) — tweak as needed
const LABEL_H = 40;   // space above images for A/B/C/D labels
const LABELS = ["A", "B", "C", "D"];

// ─── Arrow drawing ──────────────────────────────────────────────────

function drawArrow(ctx: any, x1: number, y: number, x2: number) {
	const head = 14;
	ctx.strokeStyle = "#374151";
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(x1, y);
	ctx.lineTo(x2, y);
	ctx.stroke();
	ctx.fillStyle = "#374151";
	ctx.beginPath();
	ctx.moveTo(x2, y);
	ctx.lineTo(x2 - head, y - head * 0.6);
	ctx.lineTo(x2 - head, y + head * 0.6);
	ctx.closePath();
	ctx.fill();
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
	console.log("Loading images...");
	const images = await Promise.all([
		loadImg(INPUT.config),
		loadImg(INPUT.vis),
		loadImg(INPUT.results),
		loadImg(INPUT.connection),
	]);

	// Scale each image to ROW_H, preserve aspect ratio
	const scaled = images.map((img) => {
		const s = ROW_H / img.height;
		return { img, w: Math.round(img.width * s), h: ROW_H };
	});

	// Total canvas width
	const totalW =
		PADDING * 2 +
		scaled.reduce((sum, s) => sum + s.w, 0) +
		ARROW_GAP * (scaled.length - 1);

	const totalH = PADDING * 2 + LABEL_H + ROW_H;

	const canvas = createCanvas(totalW, totalH);
	const ctx = canvas.getContext("2d");

	// Transparent background (nothing to fill)

	const imgTop = PADDING + LABEL_H;

	// Draw images, labels, and arrows
	let x = PADDING;
	for (let i = 0; i < scaled.length; i++) {
		const { img, w, h } = scaled[i];

		// Draw label (A, B, C, D) centered above image
		ctx.fillStyle = "#111827";
		ctx.font = "bold 28px 'Times New Roman', Georgia, serif";
		ctx.textAlign = "center" as const;
		ctx.textBaseline = "bottom" as const;
		ctx.fillText(LABELS[i], x + w / 2, imgTop - 8);

		// Draw image
		ctx.drawImage(img, x, imgTop, w, h);

		// Thin border
		ctx.strokeStyle = "#d1d5db";
		ctx.lineWidth = 1;
		ctx.strokeRect(x, imgTop, w, h);

		x += w;

		// Arrow (except after the last image)
		if (i < scaled.length - 1) {
			drawArrow(ctx, x + 6, imgTop + ROW_H / 2, x + ARROW_GAP - 6);
			x += ARROW_GAP;
		}
	}

	// Save
	const buffer = canvas.toBuffer("image/png");
	writeFileSync(OUTPUT, buffer);
	console.log(`✅ Pipeline saved: ${OUTPUT}`);
	console.log(`   ${totalW} × ${totalH} px  •  ${(buffer.length / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
