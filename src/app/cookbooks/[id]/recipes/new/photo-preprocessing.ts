// Resize a chosen photo before it goes to Claude. Anthropic downscales
// anything past this anyway, so sending more just costs more tokens for no
// more detail — this keeps color, since a vision model reads a photo rather
// than needing it turned into what a printed-glyph OCR engine expects.

const VISION_LONG_SIDE = 1568;

/** Resize (never upscale) and re-encode as JPEG for the photo importer. */
export async function prepareForVision(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const longSide = Math.max(bitmap.width, bitmap.height);
  const scale = longSide > VISION_LONG_SIDE ? VISION_LONG_SIDE / longSide : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.85,
    );
  });
}
