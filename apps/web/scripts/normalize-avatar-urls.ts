/**
 * Normalize avatar URLs: convert any raw presigned R2 URLs stored in Profile.avatarUrl
 * to proxy paths (/api/storage/avatars/...?public=1).
 *
 * Run: npx dotenv -e .env -- tsx scripts/normalize-avatar-urls.ts
 */

import { prisma } from "../src/server/prisma";

function normalizeAvatarUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith("r2.cloudflarestorage.com")) {
      const segments = url.pathname.replace(/^\//, "").split("/");
      // First segment is the bucket name, rest is the storage key
      const storageKey = segments.slice(1).join("/");
      if (storageKey) return `/api/storage/${storageKey}?public=1`;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

async function main() {
  const profiles = await prisma.profile.findMany({
    where: {
      avatarUrl: { not: null },
    },
    select: { id: true, avatarUrl: true, displayName: true },
  });

  console.log(`Found ${profiles.length} profiles with avatarUrl set.`);

  let updated = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const raw = profile.avatarUrl!;

    // Already a proxy path — skip
    if (raw.startsWith("/api/storage/")) {
      skipped++;
      continue;
    }

    const normalized = normalizeAvatarUrl(raw);
    if (normalized) {
      await prisma.profile.update({
        where: { id: profile.id },
        data: { avatarUrl: normalized },
      });
      console.log(`  Updated "${profile.displayName}" (${profile.id}): ${raw.slice(0, 60)}... → ${normalized}`);
      updated++;
    } else {
      // Not an R2 URL — could be an external URL, leave it alone
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
