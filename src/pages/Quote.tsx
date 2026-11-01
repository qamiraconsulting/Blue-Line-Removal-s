import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import clsx from "clsx";
import { User, Phone, Mail, MapPin, Calendar, Home as HomeIcon, Truck, Trash2, DollarSign, Clock, ShieldCheck, CircleCheck, Tag, MessageSquare, Camera, Image as ImageIcon, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";
import { MAX_JUNK_DETAILS, MAX_JUNK_PHOTOS, MAX_TOTAL_PHOTO_BYTES, PHOTO_ACCEPT } from "@/lib/junkPhotos";
import { prepareJunkPhoto, type PreparedPhoto } from "@/lib/junkPhotosBrowser";

const quoteTrust = [
  { icon: DollarSign, label: "No Hidden Fees" },
  { icon: Clock, label: "2hr Response" },
  { icon: ShieldCheck, label: "Fully Insured" },
];

const propertySizes = ["Studio / 1 Bed", "2 Bedroom", "3 Bedroom", "4+ Bedroom", "Apartment", "Office / Commercial", "Not Sure Yet"];

export function Quote() {
  const [searchParams] = useSearchParams();
  const prefilledTo = searchParams.get("to") ?? "";

  const [need, setNeed] = useState<"moving" | "junk">("moving");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Junk Removal photos (2026-11-01, ported from the test branch's Quick Quote). They live here,
  // not in the form, so they survive switching between Moving and Junk Removal; the other
  // fields are kept mounted, just hidden, for the same reason.
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(0);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(
    () => () => {
      for (const p of photosRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  async function addPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // so choosing the same photo again still works
    if (files.length === 0) return;
    setPhotoNotice(null);
    setPreparing((n) => n + files.length);
    let room = MAX_JUNK_PHOTOS - photosRef.current.length;
    let bytes = photosRef.current.reduce((sum, p) => sum + p.bytes, 0);
    const added: PreparedPhoto[] = [];
    const problems: string[] = [];
    for (const [i, file] of files.entries()) {
      if (room <= 0) {
        problems.push(`You can add up to ${MAX_JUNK_PHOTOS} photos.`);
        setPreparing((n) => n - (files.length - i));
        break;
      }
      const prepared = await prepareJunkPhoto(file, photosRef.current.length + added.length);
      setPreparing((n) => n - 1);
      if (!prepared.ok) {
        problems.push(prepared.error);
        continue;
      }
      if (bytes + prepared.photo.bytes > MAX_TOTAL_PHOTO_BYTES) {
        if (prepared.photo.previewUrl) URL.revokeObjectURL(prepared.photo.previewUrl);
        problems.push("Those photos are a little too large to send together. Please remove one or two and try again.");
        continue;
      }
      room -= 1;
      bytes += prepared.photo.bytes;
      added.push(prepared.photo);
    }
    if (added.length) setPhotos((current) => [...current, ...added]);
    setPhotoNotice([...new Set(problems)].join(" ") || null);
  }

  function removePhoto(id: string) {
    setPhotoNotice(null);
    setPhotos((current) => {
      const gone = current.find((p) => p.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (preparing > 0) {
      setError("Your photos are still being prepared -- one moment, then send again.");
      setSubmitting(false);
      return;
    }

    const data = new FormData(e.currentTarget);
    const payload = {
      name: data.get("name"),
      phone: data.get("phone"),
      email: data.get("email"),
      need,
      fromSuburb: data.get("from_suburb"),
      fromPostcode: data.get("from_postcode"),
      date: data.get("date"),
      // Each service sends only its own fields (the other service's stay hidden on the form).
      ...(need === "moving"
        ? {
            toSuburb: data.get("to_suburb"),
            toPostcode: data.get("to_postcode"),
            propertySize: data.get("propertySize"),
            notes: data.get("notes"),
          }
        : {
            junkDetails: data.get("junkDetails"),
            photos: photos.map(({ name, type, data: base64 }) => ({ name, type, data: base64 })),
          }),
    };

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // A body the server refuses as too big comes back as plain text, not JSON.
      const result = (await res.json().catch(() => ({
        error: res.status === 413 ? "Your photos are too large to send together. Please remove one or two and try again." : undefined,
      }))) as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) {
        setError(result.error ?? `We couldn't send that just now. Please email us at ${site.email} instead.`);
        return;
      }
      setSubmitted(true);
      trackEvent("quote_submitted", { service_type: need });
    } catch {
      setError("We couldn't send that just now. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Section tone="paper" className="pt-32 sm:pt-40">
        <Container className="max-w-xl">
          <Reveal>
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-3xl sm:text-4xl">Quick Quote</h1>
              <span className="shrink-0 rounded-full border border-action/50 px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.04em] text-action">
                100% Free
              </span>
            </div>

            <p className="mt-5 flex items-center gap-2.5 rounded-lg border border-action/30 bg-action/5 px-4 py-3 text-sm text-navy">
              <Tag className="h-4 w-4 shrink-0 text-action" aria-hidden="true" />
              <span>
                <strong className="font-bold">New customer?</strong> Get 10% off your first booking.
              </span>
            </p>

            <div className="mt-6 rounded-xl border border-ink/10 bg-white p-6 sm:p-8">
              {submitted ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <CircleCheck className="h-10 w-10 text-eco" aria-hidden="true" />
                  <p className="font-display text-lg font-bold text-navy">Got it — thanks!</p>
                  <p className="max-w-[36ch] text-sm text-ink-dim">
                    We've received your request and will be in touch shortly with your free quote.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="grid gap-5">
                  {error && (
                    <p className="rounded-md border border-action/30 bg-action/5 px-3.5 py-2.5 text-sm text-action-dim" role="alert">
                      {error}
                    </p>
                  )}
                  <Field label="Full Name" id="name" type="text" placeholder="Jane Smith" icon={User} required />
                  <Field label="Phone Number" id="phone" type="tel" placeholder="+61 4XX XXX XXX" icon={Phone} required />
                  <Field label="Email Address" id="email" type="email" placeholder="jane@example.com" icon={Mail} required />

                  <div className="grid gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">I need help with</span>
                    <div className="grid grid-cols-2 gap-3">
                      <NeedCard label="Moving" icon={Truck} active={need === "moving"} onClick={() => setNeed("moving")} />
                      <NeedCard label="Junk Removal" icon={Trash2} active={need === "junk"} onClick={() => setNeed("junk")} />
                    </div>
                  </div>

                  <AddressFields prefix="from" title="Moving From" />
                  {/* Junk Removal has no drop-off: hidden, not removed, so switching back keeps it. */}
                  <AddressFields prefix="to" title="Moving To" defaultSuburb={prefilledTo} className={clsx(need === "junk" && "hidden")} />
                  <Field label="Preferred Date" id="date" type="date" icon={Calendar} />

                  {/* Moving only, hidden for Junk Removal like Moving To. */}
                  <div className={clsx("grid gap-5", need === "junk" && "hidden")}>
                  <div className="grid gap-1.5">
                    <label htmlFor="propertySize" className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
                      Property Size
                    </label>
                    <div className="relative">
                      <HomeIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
                      <select
                        id="propertySize"
                        name="propertySize"
                        defaultValue={propertySizes[0]}
                        className="w-full appearance-none rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
                      >
                        {propertySizes.map((size) => (
                          <option key={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <label htmlFor="notes" className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
                      Additional notes <span className="font-medium normal-case tracking-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <MessageSquare className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-ink-dim" aria-hidden="true" />
                      <textarea
                        id="notes"
                        name="notes"
                        rows={3}
                        maxLength={1000}
                        placeholder="Stairs, parking, heavy or fragile items, anything we should know"
                        className="w-full resize-y rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
                      />
                    </div>
                  </div>
                  </div>

                  {/* Junk Removal only: kept mounted when Moving is picked so nothing typed or chosen is lost. */}
                  <div className={clsx("grid gap-5", need === "moving" && "hidden")}>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">Upload Your Junk Pics</span>
                      <label
                        htmlFor="junkPhotos"
                        className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink/20 bg-paper px-4 py-5 text-center transition-colors hover:border-action focus-within:border-action"
                      >
                        <Camera className="h-7 w-7 text-action" aria-hidden="true" />
                        <span className="font-display text-sm font-bold text-navy">Tap to take or choose photos</span>
                        <span className="text-xs text-ink-dim">JPG, PNG or HEIC &middot; up to {MAX_JUNK_PHOTOS} photos</span>
                        <input
                          id="junkPhotos"
                          type="file"
                          multiple
                          accept={PHOTO_ACCEPT}
                          onChange={addPhotos}
                          disabled={photos.length >= MAX_JUNK_PHOTOS}
                          className="sr-only"
                        />
                      </label>
                      <p className="text-xs text-ink-dim">Photos help us give you an exact price faster.</p>
                      {photoNotice && (
                        <p className="text-xs font-medium text-action-dim" role="alert">
                          {photoNotice}
                        </p>
                      )}
                      {(photos.length > 0 || preparing > 0) && (
                        <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Your junk photos">
                          {photos.map((photo, i) => (
                            <li key={photo.id} className="relative aspect-square overflow-hidden rounded-md border border-ink/10 bg-paper">
                              {photo.previewUrl ? (
                                <img src={photo.previewUrl} alt={`Junk photo ${i + 1}`} className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] text-ink-dim">
                                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                                  Photo {i + 1}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removePhoto(photo.id)}
                                aria-label={`Remove junk photo ${i + 1}`}
                                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-navy/80 text-white hover:bg-navy"
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                          {Array.from({ length: preparing }).map((_, i) => (
                            <li
                              key={`preparing-${i}`}
                              className="flex aspect-square animate-pulse items-center justify-center rounded-md border border-ink/10 bg-paper text-[10px] text-ink-dim"
                            >
                              Preparing...
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="grid gap-1.5">
                      <label htmlFor="junkDetails" className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
                        Details of Your Junk
                      </label>
                      <div className="relative">
                        <MessageSquare className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-ink-dim" aria-hidden="true" />
                        <textarea
                          id="junkDetails"
                          name="junkDetails"
                          rows={3}
                          maxLength={MAX_JUNK_DETAILS}
                          placeholder="e.g. old sofa, fridge, 10 garden bags, mattress"
                          className="w-full resize-y rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" arrow disabled={submitting || preparing > 0} className="mt-1 w-full justify-center">
                    {submitting ? "Sending…" : need === "junk" ? "Get My Junk Quote" : "Get My Free Quote"}
                  </Button>

                  <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                    {quoteTrust.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-navy">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="text-[11px] font-medium leading-tight text-ink-dim">{label}</span>
                      </div>
                    ))}
                  </div>
                </form>
              )}
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}

export default Quote;

// Where from / to: suburb and postcode, the same boxes as the test link's Quick Quote
// (2026-11-01). The team gets the street address when they call.
function AddressFields({
  prefix,
  title,
  defaultSuburb,
  className,
}: {
  prefix: string;
  title: string;
  defaultSuburb?: string;
  className?: string;
}) {
  const box = "w-full rounded-md border border-ink/15 bg-white py-2.5 px-3.5 text-sm text-ink outline-none focus:border-action";
  const label = "text-xs font-bold uppercase tracking-[0.06em] text-ink-dim";
  return (
    <fieldset className={clsx("grid gap-3", className)}>
      <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        {title}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={`${prefix}_suburb`} className={label}>
            Suburb
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
            <input
              id={`${prefix}_suburb`}
              name={`${prefix}_suburb`}
              type="text"
              maxLength={60}
              placeholder="Suburb or City"
              defaultValue={defaultSuburb}
              autoComplete="off"
              className={clsx(box, "pl-10")}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${prefix}_postcode`} className={label}>
            Postcode
          </label>
          <input
            id={`${prefix}_postcode`}
            name={`${prefix}_postcode`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="3072"
            autoComplete="off"
            className={box}
          />
        </div>
      </div>
    </fieldset>
  );
}

function NeedCard({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Truck;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
        active ? "border-action bg-action/5" : "border-ink/15 bg-white hover:border-ink/30",
      )}
    >
      <Icon className={clsx("h-6 w-6", active ? "text-action" : "text-ink-dim")} aria-hidden="true" />
      <span className="font-display text-sm font-bold text-navy">{label}</span>
      <span
        aria-hidden="true"
        className={clsx(
          "h-3.5 w-3.5 rounded-full border-2",
          active ? "border-action bg-action" : "border-ink/25 bg-white",
        )}
      />
    </button>
  );
}

function Field({
  label,
  id,
  type,
  icon: Icon,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  id: string;
  type: string;
  icon: typeof User;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-[0.06em] text-ink-dim">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="w-full rounded-md border border-ink/15 bg-white py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none focus:border-action"
        />
      </div>
    </div>
  );
}
