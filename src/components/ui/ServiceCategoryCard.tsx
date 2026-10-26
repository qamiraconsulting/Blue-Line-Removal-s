import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RevealItem } from "@/components/ui/Reveal";
import { images } from "@/data/content/images";
import { icons } from "@/lib/icons";

export type ServiceCategory = {
  key: string;
  accent: "navy" | "action";
  badge: string;
  title: string;
  body: string;
  image: keyof typeof images;
  cta?: { label: string; href: string };
  // icon is a key of the icons registry in lib/icons (plain string so the
  // homepage data needs no type annotations).
  items: { icon: string; title: string; body: string; href: string }[];
};

// One photo-topped category card with its list of sub-services, shared by
// the homepage "Two Services. One Trusted Team." section and the /services
// page. Must sit inside a RevealGroup.
export function ServiceCategoryCard({ category, titleAs: Title = "h3" }: { category: ServiceCategory; titleAs?: "h2" | "h3" }) {
  return (
    <RevealItem className="flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="relative h-56 sm:h-64">
        <img src={images[category.image]} alt={category.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/25 to-transparent" />
        <span
          className={clsx(
            "absolute left-5 top-5 rounded-full bg-white px-3.5 py-1.5 font-display text-xs font-bold uppercase tracking-[0.08em]",
            category.accent === "action" ? "text-action" : "text-navy",
          )}
        >
          {category.badge}
        </span>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <Title className="text-2xl font-black text-white">{category.title}</Title>
          <p className="mt-1 max-w-[38ch] text-sm text-white/85">{category.body}</p>
        </div>
      </div>

      <div className="divide-y divide-ink/10">
        {category.items.map((item) => {
          const Icon = icons[item.icon as keyof typeof icons];
          return (
            <a key={item.title} href={item.href} className="group flex items-start gap-4 px-5 py-4 transition-colors duration-200 hover:bg-paper">
              <span
                className={clsx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  category.accent === "action" ? "bg-action/10 text-action" : "bg-navy/10 text-navy",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-bold text-ink">{item.title}</span>
                <span className="mt-0.5 block text-sm text-ink-dim">{item.body}</span>
              </span>
              <ChevronRight
                className="mt-2 h-5 w-5 shrink-0 text-ink-dim/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink-dim"
                aria-hidden="true"
              />
            </a>
          );
        })}
      </div>

      {category.cta && (
        <div className="p-5 pt-4">
          <Button href={category.cta.href} arrow variant={category.accent === "action" ? "primary" : "navy"} className="w-full justify-center">
            {category.cta.label}
          </Button>
        </div>
      )}
    </RevealItem>
  );
}
