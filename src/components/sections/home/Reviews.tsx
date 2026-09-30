import { Star } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Button } from "@/components/ui/Button";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { reviews } from "@/data/content/home";

function Stars({ count, className }: { count: number; className: string }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${className} fill-current ${i < count ? "text-amber-400" : "text-ink/15"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function Reviews() {
  return (
    <Section id="reviews" tone="white">
      <Container>
        <Reveal className="mx-auto max-w-[56ch] text-center">
          <Eyebrow center className="mb-4">
            {reviews.eyebrow}
          </Eyebrow>
          <h2 className="text-3xl sm:text-4xl">{reviews.heading}</h2>
          <p className="mt-4 text-lg text-ink-dim">{reviews.body}</p>
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-ink/10 bg-paper px-5 py-2.5 sm:rounded-full">
            <span className="font-display text-2xl font-black text-navy">{reviews.rating.score}</span>
            <Stars count={5} className="h-5 w-5" />
            <span className="whitespace-nowrap text-sm text-ink-dim">from {reviews.rating.count} Google reviews</span>
          </div>
        </Reveal>

        {/* flex-wrap + justify-center (not grid) so a lone card on the
            last row sits centered instead of hugging the left edge. */}
        <RevealGroup className="mt-12 flex flex-wrap justify-center gap-6">
          {reviews.items.map((review) => (
            <RevealItem
              key={review.name}
              className="flex w-full flex-col rounded-lg border border-ink/10 bg-paper p-6 sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
            >
              <Stars count={review.stars} className="h-4 w-4" />
              <p className="mt-4 leading-relaxed text-ink">{review.text}</p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <span className="font-display text-sm font-bold text-navy">{review.name}</span>
                <span className="text-xs text-ink-dim">Google review</span>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <div className="mt-12 flex justify-center">
          <Button href={reviews.googleUrl} variant="outline">
            See all our reviews on Google
          </Button>
        </div>
      </Container>
    </Section>
  );
}
