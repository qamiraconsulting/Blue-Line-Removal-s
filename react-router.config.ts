import type { Config } from "@react-router/dev/config";
import { services } from "./src/data/content/services";

// Fully static site, no runtime server -- deployed to Vercel as static
// files. `ssr:false` + an explicit `prerender` list (rather than the
// `true` shorthand) is required to pick up the dynamic /services/:slug
// paths, since React Router can't know those from routes.ts alone.
export default {
  ssr: false,
  appDirectory: "src",
  prerender: [
    "/",
    "/services",
    ...services.map((service) => `/services/${service.slug}`),
    "/quote",
    "/faq",
    "/deposit",
  ],
} satisfies Config;
