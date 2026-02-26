import { toPng } from "html-to-image";

/**
 * Export a DOM element as a high-resolution PNG image.
 * Uses html-to-image under the hood with a configurable pixel ratio.
 *
 * @param element  The DOM node to capture
 * @param filename Desired download file name (without extension)
 * @param scale    Pixel ratio multiplier – higher = sharper (default 3)
 */
export async function exportDomToPng(
	element: HTMLElement,
	filename: string,
	scale = 3,
): Promise<void> {
	const dataUrl = await toPng(element, {
		pixelRatio: scale,
		backgroundColor: "#ffffff",
	});

	triggerDownload(dataUrl, `${filename}.png`);
}

/**
 * Render the current Three.js scene at a higher resolution and download it.
 *
 * Works by temporarily resizing the renderer, drawing one frame, capturing
 * the result, then restoring the original size – all within a single tick.
 *
 * @param gl         The WebGLRenderer from @react-three/fiber's `useThree()`
 * @param scene      Three.js Scene
 * @param camera     Three.js Camera
 * @param filename   Desired download file name (without extension)
 * @param multiplier Resolution multiplier (default 3)
 */
export function exportCanvasHiRes(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	gl: any,
	scene: any,
	camera: any,
	filename: string,
	multiplier = 3,
): void {
	const w = gl.domElement.width;
	const h = gl.domElement.height;

	const targetW = w * multiplier;
	const targetH = h * multiplier;

	// Save current state
	const prevSize = { width: gl.domElement.width, height: gl.domElement.height };
	const prevStyle = {
		width: gl.domElement.style.width,
		height: gl.domElement.style.height,
	};

	try {
		// Resize renderer to high-res, render one frame, capture
		gl.setSize(targetW, targetH, false);
		gl.render(scene, camera);
		const dataUrl = gl.domElement.toDataURL("image/png");
		triggerDownload(dataUrl, `${filename}.png`);
	} finally {
		// Restore original size
		gl.setSize(prevSize.width, prevSize.height, false);
		gl.domElement.style.width = prevStyle.width;
		gl.domElement.style.height = prevStyle.height;
		gl.render(scene, camera);
	}
}

// ─── internal ────────────────────────────────────────────────────────

function triggerDownload(dataUrl: string, filename: string): void {
	const link = document.createElement("a");
	link.download = filename;
	link.href = dataUrl;
	link.click();
}
