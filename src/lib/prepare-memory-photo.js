// No input-byte limit: resize decoded images before uploading, without a library.
export async function prepareMemoryPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo. Try another image.");
    context.fillStyle = "#fff";
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [.85,.7,.5,.3]) {
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if (blob && blob.size<=2097152) return blob;
    }
    throw new Error("Could not prepare this photo. Try another image.");
  } finally { URL.revokeObjectURL(url); }
}
