import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Cover images live in Vercel Blob, whose public URLs are
     * `https://<store-id>.public.blob.vercel-storage.com/...`. One `*` matches
     * the store id and nothing else, so this stays an allowlist of our own
     * store rather than of the whole internet.
     *
     * The URL that reaches this loader is client-supplied — it rides in a
     * hidden form field — so the same host rule is enforced again in
     * `coverImageUrlSchema` before anything is written to the database. This
     * config only decides what the optimizer will fetch; the schema decides
     * what may be stored.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        port: "",
        search: "",
      },
    ],
  },
};

export default nextConfig;
