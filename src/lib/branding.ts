export const DEFAULT_PRIMARY = "#1d4ed8";
export const DEFAULT_ACCENT = "#2563eb";
export const LOGO_BUCKET = "infoaxon-business-logos";
export const MAX_LOGO_BYTES = 512 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HEX = /^#[0-9a-f]{6}$/i;

export function luminance(hex: string): number {
  if (!HEX.test(hex)) throw new Error("Invalid color");
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function themeText(primary: string, accent: string): string | null {
  if (!HEX.test(primary) || !HEX.test(accent)) return null;
  // Check the sRGB gradient interior as well as its endpoints.
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const start = channels(primary), end = channels(accent);
  const values = Array.from({ length: 257 }, (_, step) => luminance("#" +
    start.map((value, i) => Math.round(value + (end[i] - value) * step / 256)
      .toString(16).padStart(2, "0")).join("")));
  const white = Math.min(...values.map((v) => 1.05 / (v + 0.05)));
  const black = Math.min(...values.map((v) => (v + 0.05) / 0.05));
  if (Math.max(white, black) < 4.5) return null;
  return white >= black ? "#ffffff" : "#000000";
}

export type BusinessDetails = {
  id: string; name: string; code: string; phone: string | null;
  email: string | null; address: string | null; active: boolean;
  currency_code: string; timezone: string; logo_path: string | null;
  primary_color: string; accent_color: string; updated_at: string;
};

export type BusinessBrand = Pick<BusinessDetails,
  "id" | "name" | "code" | "logo_path" | "primary_color" | "accent_color" | "timezone"
> & { full_name: string; role: string; branch_name: string | null };

export function logoUrl(base: string | undefined, path: string | null): string | null {
  if (!base || !path || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}[.]webp$/.test(path)) return null;
  let url: URL;
  try { url = new URL(base); } catch { return null; }
  if (url.protocol !== "https:" && !(url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
  return url.origin + "/storage/v1/object/public/" + LOGO_BUCKET + "/" + path;
}
