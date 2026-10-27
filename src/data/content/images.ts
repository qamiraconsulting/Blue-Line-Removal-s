// All /images/*.webp files (2026-08-10) are AI-generated with the real
// Blue Line Removals branding (logo, uniforms) rendered onto the truck and
// crew, matching the client's sample site -- see public/images/. Converted
// from the original PNGs and compressed (sharp, quality 78, capped at
// 1920w for the hero / 1200w elsewhere) -- ~22MB of PNGs down to ~1.3MB of
// WebP, since none of these were ever displayed anywhere near full
// resolution. (The old Unsplash `serviceJunk` placeholder was removed
// 2026-10-26: it showed another company's branded skip bin.)

export const images = {
  hero: "/images/hero-truck.webp", // branded truck on a city street at dusk -- "beyond boxes, we move memories" hero
  before: "/images/before-garage.webp", // cluttered garage, same angle as `after` for a clean comparison
  after: "/images/after-garage.webp", // same garage emptied out, folded branded moving blanket left in the corner
  homeRemovals: "/images/home-removals.webp", // branded crew carrying a wrapped chair into the truck outside a house
  officeRemovals: "/images/office-removals.webp", // branded crew wheeling office furniture out of a building
  interstateRemovals: "/images/interstate-removals.webp", // branded truck on the open highway
  junkRemoval: "/images/movers-loading-sofa.webp", // client-provided photo: two branded-uniform crew loading junk (bagged rubbish, old furniture) into the branded truck
  packingUnpacking: "/images/packing-unpacking.webp", // branded crew member wrapping a picture frame
  storageSolutions: "/images/storage-solutions.webp", // branded crew wheeling boxes into a storage unit, truck visible outside
  specialtyItems: "/images/specialty-items.webp", // branded crew loading a piano into the truck
  teamTrust: "/images/team-trust.webp", // 3 branded crew members standing arms-crossed in front of the open truck -- client's own photo (BLR Team.png), not AI-generated like the rest
  // Branded AI photos for the per-service pages (2026-10-27, 1200x1200, each
  // used for both the page hero and its bottom banner).
  apartmentMoves: "/images/apartment-unit-moves.webp", // crew carrying a wrapped armchair out of an apartment lobby to the truck
  rubbishRemoval: "/images/rubbish-removal.webp", // crew loading rubbish bags and cardboard from a driveway
  furnitureRemoval: "/images/furniture-removal.webp", // crew carrying an old sofa out of a brick house to the truck
  greenWasteRemoval: "/images/green-waste-removal.webp", // crew loading branches and bagged garden waste from a backyard
  garageShedClearOuts: "/images/garage-shed-clear-outs.webp", // crew carrying a bike and a box of tools out of a cluttered garage
  endOfLeaseCleanOuts: "/images/end-of-lease-clean-outs.webp", // crew carrying a bedside table and a box out of an empty rental
  junkRemovalBanner: "/images/junk-removal-banner.webp", // crew loading a kerbside junk pile (mattress, chair, e-waste) -- Junk Removal's bottom banner
} as const;
