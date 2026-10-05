// All /images/*.webp files (2026-08-10) are AI-generated with the real
// Blue Line Removals branding (logo, uniforms) rendered onto the truck and
// crew, matching the client's sample site -- see public/images/. Converted
// from the original PNGs and compressed (sharp, quality 78, capped at
// 1920w for the hero / 1200w elsewhere) -- ~22MB of PNGs down to ~1.3MB of
// WebP, since none of these were ever displayed anywhere near full
// resolution. `serviceJunk` is still a temporary Unsplash placeholder;
// swap for a real client photo before launch.
function unsplash(id: string, w: number) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
}

export const images = {
  hero: "/images/hero-truck.webp", // branded truck on a city street at dusk -- "beyond boxes, we move memories" hero
  before: "/images/before-garage.webp", // cluttered garage, same angle as `after` for a clean comparison
  after: "/images/after-garage.webp", // same garage emptied out, folded branded moving blanket left in the corner
  serviceJunk: unsplash("photo-1738236662730-b4ea66d35d0c", 900), // pile of junk outside a building -- junk-removal's CTA banner accent
  homeRemovals: "/images/home-removals.webp", // branded crew carrying a wrapped chair into the truck outside a house
  officeRemovals: "/images/office-removals.webp", // branded crew wheeling office furniture out of a building
  interstateRemovals: "/images/interstate-removals.webp", // branded truck on the open highway
  junkRemoval: "/images/movers-loading-sofa.webp", // client-provided photo: two branded-uniform crew loading junk (bagged rubbish, old furniture) into the branded truck
  packingUnpacking: "/images/packing-unpacking.webp", // branded crew member wrapping a picture frame
  storageSolutions: "/images/storage-solutions.webp", // branded crew wheeling boxes into a storage unit, truck visible outside
  specialtyItems: "/images/specialty-items.webp", // branded crew loading a piano into the truck
  teamTrust: "/images/team-trust.webp", // 3 branded crew members standing arms-crossed in front of the open truck -- client's own photo (BLR Team.png), not AI-generated like the rest
} as const;
