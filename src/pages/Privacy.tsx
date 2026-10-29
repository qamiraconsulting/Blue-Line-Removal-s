import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { privacy } from "@/data/content/privacy";

// Plain long-form page -- no CTA banner or animation per section, so the
// policy reads as a document. Linked from the footer and used as the
// privacy-policy URL for Google Ads and Meta.
export function Privacy() {
  return (
    <Section tone="paper" className="pt-32 sm:pt-40">
      <Container>
        <Reveal className="mx-auto max-w-2xl">
          <Eyebrow className="mb-4">{privacy.eyebrow}</Eyebrow>
          <h1 className="text-3xl sm:text-4xl">{privacy.heading}</h1>
          <p className="mt-2 text-sm text-ink-dim">Last updated {privacy.updated}</p>
          <p className="mt-6 text-ink-dim">{privacy.intro}</p>
        </Reveal>

        <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-8">
          {privacy.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-bold text-navy">{section.heading}</h2>
              {section.paragraphs?.map((p) => (
                <p key={p} className="mt-3 text-ink-dim">
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-ink-dim">
                  {section.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {section.closing && <p className="mt-3 text-ink-dim">{section.closing}</p>}
            </section>
          ))}
        </div>
      </Container>
    </Section>
  );
}

export default Privacy;
