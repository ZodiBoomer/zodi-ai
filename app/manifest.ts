import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Zodi AI",
    short_name: "Zodi AI",
    description: "Ton assistant IA personnel, avec conversations et mémoire synchronisées.",
    lang: "fr-FR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#090d18",
    theme_color: "#090d18",
    categories: ["productivity", "utilities"]
  };
}
