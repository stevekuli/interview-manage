// Generates the product brand icons (SVG + PNG + ICO) from a single briefcase-check glyph.
// Run from the repo root: node tooling/brand/generate-brand-assets.mjs
// @boundaries-ignore dev-only asset generation script; sharp is a tooling devDependency
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apps/web/public");

const TILE_LIGHT = "#4F46E5"; // indigo-600 — light-theme tile
const TILE_DARK = "#818CF8"; // indigo-400 — dark-theme tile
const GLYPH = "#FFFFFF";

// Briefcase body + handle + progress check, drawn on a 256x256 canvas.
function glyphPaths(color, scale = 1, offsetX = 0, offsetY = 0) {
	const s = (v) => v * scale;
	return `
		<rect x="${s(104 + offsetX)}" y="${s(66 + offsetY)}" width="${s(48)}" height="${s(46)}" rx="${s(12)}" fill="${color}" />
		<rect x="${s(52 + offsetX)}" y="${s(94 + offsetY)}" width="${s(152)}" height="${s(100)}" rx="${s(22)}" fill="${color}" />
		<path
			d="M ${s(92 + offsetX)} ${s(146 + offsetY)} l ${s(28)} ${s(28)} l ${s(52)} ${s(-52)}"
			fill="none" stroke="${TILE_LIGHT}" stroke-width="${s(18)}"
			stroke-linecap="round" stroke-linejoin="round"
		/>`;
}

/** Tile icon with safe padding (used at 256px as favicon/PWA "any"). */
function tileSvg({ tile, size = 256, radius = 56 }) {
	return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
<title>求职管理</title>
<rect width="256" height="256" rx="${radius}" fill="${tile}" />
${glyphPaths(GLYPH)}
</svg>`;
}

/** Full-bleed tile with the glyph shrunk into the maskable safe zone (80%). */
function maskableSvg({ tile }) {
	return `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
<title>求职管理</title>
<rect width="256" height="256" fill="${tile}" />
<g transform="translate(25.6 25.6) scale(0.8)">${glyphPaths(GLYPH)}</g>
</svg>`;
}

/** Full-bleed tile for Apple touch icons and the favicon.ico raster. */
function bleedSvg({ tile }) {
	return `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
<title>求职管理</title>
<rect width="256" height="256" fill="${tile}" />
${glyphPaths(GLYPH)}
</svg>`;
}

/** Minimal ICO container wrapping a single PNG-encoded image. */
function buildIco(png, { width, height }) {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(1, 4); // image count
	const entry = Buffer.alloc(16);
	entry.writeUInt8(width >= 256 ? 0 : width, 0);
	entry.writeUInt8(height >= 256 ? 0 : height, 1);
	entry.writeUInt8(0, 2); // palette
	entry.writeUInt8(0, 3); // reserved
	entry.writeUInt16LE(1, 4); // color planes
	entry.writeUInt16LE(32, 6); // bits per pixel
	entry.writeUInt32LE(png.length, 8); // data size
	entry.writeUInt32LE(22, 12); // data offset (6 + 16)
	return Buffer.concat([header, entry, png]);
}

const svgFiles = [
	["icon/light.svg", tileSvg({ tile: TILE_LIGHT })],
	["icon/dark.svg", tileSvg({ tile: TILE_DARK })],
	["logo/light.svg", tileSvg({ tile: TILE_LIGHT })],
	["logo/dark.svg", tileSvg({ tile: TILE_DARK })],
	["favicon.svg", tileSvg({ tile: TILE_LIGHT })],
];

const pngTargets = [
	["pwa-64x64.png", 64, tileSvg({ tile: TILE_LIGHT })],
	["pwa-192x192.png", 192, tileSvg({ tile: TILE_LIGHT })],
	["pwa-512x512.png", 512, tileSvg({ tile: TILE_LIGHT, radius: 112 })],
	["maskable-icon-512x512.png", 512, maskableSvg({ tile: TILE_LIGHT })],
	["apple-touch-icon-180x180.png", 180, bleedSvg({ tile: TILE_LIGHT })],
];

await mkdir(OUT_DIR, { recursive: true });
for (const [name, content] of svgFiles) {
	await writeFile(path.join(OUT_DIR, name), content, "utf8");
}

for (const [name, size, svg] of pngTargets) {
	const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
	await writeFile(path.join(OUT_DIR, name), png);
}

const icoPng = await sharp(Buffer.from(bleedSvg({ tile: TILE_LIGHT })))
	.resize(256, 256)
	.png()
	.toBuffer();
await writeFile(path.join(OUT_DIR, "favicon.ico"), buildIco(icoPng, { width: 256, height: 256 }));

// Social share banners (1200x630): soft brand background with the tile mark centered.
function bannerSvg({ tile }) {
	return `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="1200" height="630" fill="#EEF2FF" />
<rect x="80" y="80" width="1040" height="470" rx="40" fill="#E0E7FF" />
<g transform="translate(472 187)">${tileSvg({ tile, radius: 56 }).replace(/<svg[^>]*>|<\/svg>|<title>[\s\S]*?<\/title>/g, "")}</g>
</svg>`;
}

const ogDir = path.join(OUT_DIR, "opengraph");
await mkdir(ogDir, { recursive: true });
const bannerPng = await sharp(Buffer.from(bannerSvg({ tile: TILE_LIGHT })))
	.png()
	.toBuffer();
await writeFile(path.join(ogDir, "banner.jpg"), await sharp(bannerPng).jpeg({ quality: 90 }).toBuffer());
await writeFile(path.join(ogDir, "ats-checker.png"), bannerPng);

console.log(`Brand assets written to ${OUT_DIR}`);
