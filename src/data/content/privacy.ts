// Privacy policy copy (added 2026-10-13). Written against the Australian
// Privacy Principles for what the site actually does today: the quote and
// callback forms (emailed to the team via Resend), hosting on Vercel, and
// GA4 + Google Ads + Meta Pixel loaded through GTM. If a new form, tool or
// tracking tag is added, update the matching section and `updated` here.
// 2026-10-29: added the website chat (Anthropic), instant estimates (Google Maps), the quote,
// booking and chat records (Neon), junk photos, and drivers getting job details.
// Not legal advice -- worth a review by the client's own adviser.
import { site } from "@/data/site";

export type PrivacySection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  closing?: string;
};

export const privacy = {
  eyebrow: "Privacy",
  heading: "Privacy Policy",
  updated: "29 October 2026",
  intro: `${site.name} (ABN 90 701 004 480) respects your privacy. This policy explains what personal information we collect, how we use it, and the choices you have. We handle personal information in line with the Privacy Act 1988 (Cth) and the Australian Privacy Principles.`,
  sections: [
    {
      heading: "What we collect",
      paragraphs: ["We only collect information you give us or that your browser sends when you use our website:"],
      bullets: [
        "Quote requests: your name, email address, phone number, pickup and drop-off suburbs or addresses, moving date, property size, the service you need, any notes you add, and any photos you upload for a junk removal quote.",
        "Our website chat: the messages you type, and the details you give there -- such as your name, email address, phone number, full pickup and drop-off addresses, moving date, home size, access (stairs, lifts, parking) and heavy items.",
        "Bookings: the date and arrival time you choose, and your agreement to our booking terms.",
        "Callback requests: your name, email address, phone number, and the day and time you'd like us to call.",
        "Phone calls and emails: your contact details and whatever you tell us about your move or junk removal job.",
        "Website usage: pages visited, the ad or link that brought you to us, device and browser type, approximate location (city level), and whether you submitted a quote or tapped to call us. This is collected using cookies and similar technologies (see below).",
      ],
    },
    {
      heading: "How we use your information",
      bullets: [
        "To prepare and send your quote or estimate, including working out the driving distance and time between your addresses, and to contact you about your booking.",
        "To answer your questions in our website chat. The chat is an AI assistant; a member of our team can read the conversation and reply to you in it.",
        "To call you back when you ask us to.",
        "To deliver the service you book, including scheduling the crew and truck, and giving the driver the details they need for your job (your name, phone number, addresses and access notes), usually by email the day before your move.",
        "To ask for feedback after a job, so we can improve our service.",
        "To understand how people find and use our website, and to measure and improve our advertising.",
      ],
      closing:
        "We don't sell your personal information, and we won't send you marketing emails or texts unless you've agreed to receive them. You can opt out of any marketing message at any time.",
    },
    {
      heading: "Cookies, analytics and advertising",
      paragraphs: [
        "Our website uses Google Tag Manager to load Google Analytics, Google Ads conversion tracking and the Meta (Facebook and Instagram) Pixel. These tools use cookies and similar technologies to tell us which pages are visited, which ads lead to quote requests or calls, and to show our ads to people who have visited our website.",
        "We don't send your name, email address or phone number to Google or Meta through these tools.",
        "You can block or delete cookies in your browser settings, and control how ads are personalised for you:",
      ],
      bullets: [
        "Google: adssettings.google.com, or install the Google Analytics opt-out browser add-on at tools.google.com/dlpage/gaoptout.",
        "Meta: the Ad Preferences page in your Facebook or Instagram settings.",
        "Industry-wide opt-out: youronlinechoices.com.au.",
      ],
    },
    {
      heading: "Who we share it with",
      paragraphs: [
        "We share personal information only with service providers that help us run our business, and only for that purpose:",
      ],
      bullets: [
        "Vercel, which hosts our website.",
        "Resend, which delivers the emails our website and chat send.",
        "Anthropic, which provides the AI that powers our website chat (it processes your chat messages to write the replies).",
        "Google Maps Platform, which works out the driving distance and time between your addresses for your estimate.",
        "Neon, which stores our quote, booking and chat records.",
        "Google, which provides our email, analytics and advertising tools.",
        "Meta, which provides advertising tools for Facebook and Instagram.",
        "Our marketing agency, Qamira Consulting, which manages our website, chat and advertising on our behalf.",
        "Our drivers and crew, who receive the details of the jobs they work on.",
      ],
    },
    {
      heading: "Overseas disclosure",
      paragraphs: [
        "Some of these providers store or process information outside Australia, mainly in the United States. We take reasonable steps to make sure they protect your information in a way that's consistent with the Australian Privacy Principles.",
      ],
    },
    {
      heading: "How we keep it safe",
      paragraphs: [
        "We store information with reputable providers that use encryption and access controls, and we limit access to people who need it to do their job. We keep information only for as long as we need it for the purposes above or as the law requires, then delete or de-identify it.",
      ],
    },
    {
      heading: "Accessing or correcting your information",
      paragraphs: [
        `You can ask to see the personal information we hold about you, or ask us to correct or delete it, by emailing ${site.email}. We'll respond within 30 days. We don't charge for these requests.`,
      ],
    },
    {
      heading: "Complaints",
      paragraphs: [
        `If you have a concern about how we've handled your personal information, please email ${site.email} and we'll look into it and reply within 30 days. If you're not satisfied with our response, you can contact the Office of the Australian Information Commissioner at oaic.gov.au or on 1300 363 992.`,
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: [
        "We may update this policy from time to time. The latest version will always be on this page, with the date it was last updated.",
      ],
    },
    {
      heading: "Contact us",
      paragraphs: [`${site.name}, Melbourne, VIC. Email ${site.email} or call ${site.phone.display}.`],
    },
  ] satisfies PrivacySection[],
};
