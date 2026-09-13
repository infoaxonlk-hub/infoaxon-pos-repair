import "server-only";
import sharp from "sharp";
import { MAX_LOGO_BYTES } from "@/lib/branding";

export async function normalizeLogo(file: File): Promise<Buffer> {
  if (file.size === 0 || file.size > MAX_LOGO_BYTES ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Use PNG, JPEG or WebP, no larger than 512 KB.");
  }
  const input = Buffer.from(await file.arrayBuffer());
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
  const webp = input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new Error("Unsupported image content.");
  const options = { limitInputPixels: 16_000_000, failOn: "warning" as const };
  const meta = await sharp(input, options).metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) {
    throw new Error("Use a non-animated PNG, JPEG or WebP image.");
  }
  const output = await sharp(input, options).rotate()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 }).toBuffer();
  if (output.length > MAX_LOGO_BYTES) throw new Error("Logo is too large after resizing.");
  return output;
}
