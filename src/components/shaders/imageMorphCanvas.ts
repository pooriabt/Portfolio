// src/components/shaders/imageMorphCanvas.ts
export async function createMorphCanvas(
  images: string[],
  width = 1024,
  height = 1536
) {
  // create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // load images
  const imgEls = await Promise.all(
    images.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        })
    )
  );

  // initial draw (img 0 full)
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(imgEls[0], 0, 0, width, height);

  // returns object with API to create timeline and texture
  return {
    canvas,
    ctx,
    imgs: imgEls,
    draw: (iFrom: number, iTo: number, t: number, blurFrom = 6, blurTo = 0) => {
      // t in [0,1]
      ctx.clearRect(0, 0, width, height);
      // draw from with decreasing alpha + blur
      ctx.filter = `blur(${(1 - t) * blurFrom}px)`;
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(imgEls[iFrom], 0, 0, width, height);
      // draw to with increasing alpha + blur
      ctx.filter = `blur(${t * blurTo}px)`;
      ctx.globalAlpha = t;
      ctx.drawImage(imgEls[iTo], 0, 0, width, height);
      // reset
      ctx.globalAlpha = 1;
      ctx.filter = "none";
    },
  };
}
