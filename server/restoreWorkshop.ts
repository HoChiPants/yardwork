import { restoreWorkshopArchive } from "./workshopArchive";

const [, , archive, destination, ...rest] = process.argv;
if (!archive || !destination || rest.length) {
  console.error(
    "Usage: npm run restore-workshop -- <backup-file> <new-data-directory>",
  );
  process.exitCode = 1;
} else {
  try {
    const files = await restoreWorkshopArchive(archive, destination);
    console.log(
      `Restored ${files} saved project or revision files to ${destination}.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Workshop restore failed.",
    );
    process.exitCode = 1;
  }
}
