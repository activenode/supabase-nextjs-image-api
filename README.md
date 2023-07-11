# Super-simple Pseudo-CDN for Images for Supabase with NextJS

## Why would I need that?

- Uploading images to protected storage (so non-public buckets) will require you to download images.
  There is no such thing as "Direct image link with policy access".

- The option is downloading images and showing them via NextJS Server API but if the image is bigger than 4MB you will easily have rejected requests (https://nextjs.org/docs/messages/api-routes-response-size-limit).

## Ok but what does this do then?

In simple words: You create an `api/loadImage` route and use this package and here we go, you can skip the 4mb limit and you can have direct links to images.

Your mini CDN.

## How does it work?

In simple words: The package uses `sharp` package to downscale images based on the given byte limits (which you can configure).

This is usually pretty fast and solid.

## But what if I need the full resolution image?

1. In most use-cases you really don't. If your users upload 10k images you probably don't want to show 10k.
2. Technically there is no issue at all with this package showing the full resolution as you could just oversize the byte limit and set the `maxSizeWidth` to whatever you want and you're good to go. But then you'll run back into memory issues sooner or later (as provided in the NextJS link above)
3. The normal way is this:
   - You use this package to show images
   - If someone wants the original solution you'll build a special button to download it and use the [`createSignedUrl`](https://supabase.com/docs/reference/javascript/storge-from-createsignedurls)

## Can't I just use the Image Transforms from Supabase itself?

Sure, you can. Be aware of the limits and the costs though.

## With which version of NextJS is this compatible?

Since you can freely use the `pages/api` route even in the NextJS@13 version
you can use this with v13 without any problems (I do).

## Usage:

```bash
npm i sharp supabase-nextjs-image-api
```

```typescript
// api/load-image.ts
import {
  loadImageSafely,
  // a preset for thumbnail loading
  THUMBNAIL_IMAGE_LOADER_OPTIONS,
  // a preset for "fullsize" images
  FULL_IMAGE_LOADER_OPTIONS,
  ImageLoaderOptions,
  SupabaseImageData,
} from "supabase-nextjs-image-api";
import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";

export async function YourRoute(
  req: NextApiRequest,
  res: NextApiResponse<ReturnData>
) {
  // Normal Policies obviously apply so the package will only be able to grab
  // the image if you provide a client with access to it (e.g. super client)
  const client = createServerSupabaseClient({ req, res });

  const imageData: SupabaseImageData = {
    path: "your-path-to-the-image.png", // e.g. load from req.query parameter
    bucket: "your-bucket-name",
  };

  let imageLoaderOptions: ImageLoaderOptions = {
    ...THUMBNAIL_IMAGE_LOADER_OPTIONS,
    //   maxSizeBytes: number; // for Vercel deploys this should be below 4mb
    //   maxSizeWidth: number;
    //   quality: number;
    //   progressive?: boolean;
    //   standardCacheTime?: number;
  };

  return loadImageSafely(res, client, imageData, imageLoaderOptions);
}
```
