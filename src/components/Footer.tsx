import Link from "next/link";
import Image from "next/image";
import TornStrip from "./TornEdge";


const SOCIALS: {
  name: string;
  href: string;
  path: string;
  /** icons drawn on a full-bleed 24px grid get extra padding here */
  viewBox?: string;
}[] = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/igirerwandaorganization/",
    path: "M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v6h3v-6h2.3l.7-3H13V9c0-.6.4-1 1-1z",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/igire_rwanda/",
    path: "M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zm4 3.5A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5zm0 2A1.5 1.5 0 1 1 10.5 12 1.5 1.5 0 0 1 12 10.5zM16.2 7a.8.8 0 1 0 .8.8.8.8 0 0 0-.8-.8z",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/igirerwanda",
    path: "M6.5 8.5A1.5 1.5 0 1 0 5 7a1.5 1.5 0 0 0 1.5 1.5zM5.3 10h2.4v9H5.3zm5 0h2.3v1.2A2.9 2.9 0 0 1 15 10c2.2 0 3.7 1.4 3.7 4.2V19h-2.4v-4.4c0-1.3-.5-2.2-1.7-2.2A1.8 1.8 0 0 0 12.7 14v5h-2.4z",
  },
  {
    name: "X (Twitter)",
    href: "https://x.com/igirerwandaorg",
    viewBox: "-6 -6 36 36",
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@igirerwandaorganization7651",
    viewBox: "-6 -6 36 36",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
];

export default function Footer() {
  return (
    <footer className="bg-bg">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-[1.1fr_1.3fr]">
        <div>
          <h3 className="label mb-4 text-sm font-semibold text-sage">
            Contact
          </h3>
          <address className="text-sm not-italic leading-relaxed text-cream-dim">
            KG 11 Ave, Kacyiru
            <br />
            Kigali, Rwanda
            <br />
            <a href="tel:+250780000000" className="hover:text-orange">
              +250 780 000 000
            </a>
            <br />
            <a href="mailto:info@igirerwanda.org" className="hover:text-orange">
              info@igirerwanda.org
            </a>
          </address>
          <h3 className="label mb-3 mt-8 text-sm font-semibold text-sage">
            Availability
          </h3>
          <p className="text-sm text-cream-dim">
                Monday - Friday, 8.30am – 5pm or by appointment
          </p>
          {/* "or by appointment" was the only mention of booking anywhere on
              the site, and it linked to nothing */}
          <Link
            href="/book"
            className="mt-2 inline-block text-sm font-semibold text-orange transition-colors hover:text-orange-deep"
          >
            Book a conversation →
          </Link>
        </div>

        {/* <div>
          <h3 className="label mb-4 text-sm font-semibold text-sage">
            Discover
          </h3>
          <div className="grid grid-cols-2 gap-x-8">
            {[DISCOVER_LEFT, DISCOVER_RIGHT].map((col, i) => (
              <ul key={i} className="space-y-3 text-sm text-cream-dim">
                {col.map((item) => (
                  <li key={item}>
                    <a href="#calendar" className="hover:text-orange">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div> */}

        <div className="md:text-right">
          <h3 className="label mb-4 text-sm font-semibold text-sage">
            Stay social
          </h3>
          <div className="flex gap-3 md:justify-end">
            {SOCIALS.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${social.name} (opens in a new tab)`}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-cream text-bg transition-colors hover:bg-orange"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox={social.viewBox ?? "0 0 24 24"}
                  fill="currentColor"
                >
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
          <p className="label mt-10 text-xs font-semibold text-cream-dim">
            Empowering communities
            <br />
            since 2018
          </p>
        </div>
      </div>

      <TornStrip />

      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-10">
        <a href="#" className="flex items-center gap-4">
          <Image
            src="/iro-logo.svg"
            alt="Igire Rwanda Organization"
            width={64}
            height={64}
            className="h-16 w-16"
          />
          <span className="display text-2xl leading-tight text-cream">
            Igire Rwanda
            <br />
            Organization
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-cream-dim">
          <p>© 2026 Igire Rwanda Organization</p>
          <a href="#" className="hover:text-orange">
            Privacy Policy
          </a>
          <a href="#" className="hover:text-orange">
            Terms &amp; Conditions
          </a>
        </div>
      </div>
    </footer>
  );
}
