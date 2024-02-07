import { SupabaseClient } from "@supabase/supabase-js";
import { NextApiResponse } from "next";
import sharp from "sharp";

export const TRANSPARENT_IMAGE_GIF_BYTES = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=",
  "base64"
);

async function loadImageFromSupabase(
  serverClient: SupabaseClient,
  bucket: string,
  path: string
) {
  const { data: blob, error } = await serverClient.storage
    .from(bucket)
    .download(path);

  const errInfo = JSON.stringify({
    bucket,
    path,
  });

  if (error) {
    throw new Error("Image not found > " + errInfo);
  }

  if (!blob) {
    throw new Error("Blob was not retrieved > " + errInfo);
  }

  return blob;
}

function deriveImageTypeFromPath(path: string) {
  const lPath = path.toLowerCase();
  let ext =
    lPath.endsWith(".jpeg") || lPath.endsWith(".jpg")
      ? "jpg"
      : lPath.endsWith(".gif")
      ? "gif"
      : lPath.endsWith(".png")
      ? "png"
      : lPath.endsWith(".heic")
      ? "heic"
      : lPath.endsWith(".tiff")
      ? "tiff"
      : lPath.endsWith(".webp")
      ? "webp"
      : "unknown";

  return ext;
}
// supabase package + video (yt)

export type SupabaseImageData = {
  bucket: string;
  path: string;
};

export type ImageLoaderOptions = {
  maxSizeBytes: number;
  maxSizeWidth: number;
  quality: number;
  progressive?: boolean;
  standardCacheTime?: number;
  sharpen?: boolean;
};

const oneKbInBytes = 1024;
const hundredKbs = 100 * oneKbInBytes;

const STANDARD_CACHE_TIME = 60 * 60 * 24 * 5; // 5 days
export const THUMBNAIL_IMAGE_LOADER_OPTIONS: ImageLoaderOptions = {
  maxSizeBytes: hundredKbs * 2,
  maxSizeWidth: 120,
  quality: 60,
  progressive: true,
  standardCacheTime: STANDARD_CACHE_TIME,
};

export const FULL_IMAGE_LOADER_OPTIONS: ImageLoaderOptions = {
  maxSizeBytes: hundredKbs * 10,
  maxSizeWidth: 2500,
  quality: 94,
  progressive: true,
  standardCacheTime: STANDARD_CACHE_TIME,
};

async function getStreamableImage(
  supabaseClient: SupabaseClient,
  imageData: SupabaseImageData,
  options: ImageLoaderOptions
) {
  let streamable: sharp.Sharp;

  const { maxSizeBytes, maxSizeWidth, quality, progressive } = options;

  const imageType = deriveImageTypeFromPath(imageData.path);

  if (imageType === "unknown") {
    throw new Error("Unknown image type: " + imageData.path);
  }

  const blob = await loadImageFromSupabase(
    supabaseClient,
    imageData.bucket,
    imageData.path
  );

  // now processing with sharp
  const buffer = Buffer.from(await blob.arrayBuffer());
  const parseImage = sharp(buffer);
  const imageMeta = await parseImage.metadata();

  if (!imageMeta.width) {
    throw new Error("Not possible to retrieve image width");
  }

  streamable = parseImage;

  if (buffer.byteLength > maxSizeBytes || imageMeta.width > maxSizeWidth) {
    // we need to resize:
    const downscaleFactorBytesEstimated = Math.min(
      1,
      maxSizeBytes / buffer.byteLength
    );

    const downScaleFactorWidthEstimated = Math.min(
      1,
      maxSizeWidth / imageMeta.width
    );

    const factor = Math.min(
      downScaleFactorWidthEstimated,
      downscaleFactorBytesEstimated
    );

    streamable = streamable.rotate().resize(Math.round(imageMeta.width * factor));
  }

  if (options.sharpen) {
    streamable = streamable.sharpen({
      sigma: 0.9,
    });
  }

  streamable = streamable.jpeg({
    quality,
    progressive,
  });

  return streamable;
}

export async function loadImageSafely(
  apiRes: NextApiResponse,
  supabaseClient: SupabaseClient,
  imageData: SupabaseImageData,
  options: ImageLoaderOptions & {
    onError?: (e: any) => void;
    useTransparentImageFallback?: boolean;
  }
) {
  const { onError, useTransparentImageFallback } = options;

  try {
    if (!imageData.bucket || !imageData.path) {
      throw new Error("Invalid image data");
    }

    const streamable = await getStreamableImage(
      supabaseClient,
      imageData,
      options
    );

    apiRes.writeHead(200, {
      "Content-Type": "image/jpg",
      // 'Content-Length': blob.size,
      "Cache-control": "max-age=" + options.standardCacheTime,
    });

    return await new Promise<void>((resolve) => {
      // const readStream = blob.stream();
      streamable.pipe(apiRes);
      // readStream.pipe(resized.);
      streamable.on("end", resolve);
    });
  } catch (e) {
    onError?.(e);

    const errStr = e + "";
    let errCode = 500;
    let errMessage = "Internal server error";

    if (errStr.includes("Image not found")) {
      errCode = 404;
      errMessage = "Image not found";
    }

    if (useTransparentImageFallback) {
      apiRes.writeHead(errCode, {
        "Content-Type": "image/gif",
        "Content-Length": TRANSPARENT_IMAGE_GIF_BYTES.byteLength,
        "Cache-control": "no-cache",
      });

      apiRes.end(TRANSPARENT_IMAGE_GIF_BYTES, "binary");
    } else {
      apiRes.status(errCode).send(errMessage);
    }
  }
}
