import { resolveStream } from "../lib/vidking-resolver";

const tmdbId = process.argv[2] ?? "27205";
const type = process.argv[3] ?? "movie";

async function main() {
  const params =
    type === "tv"
      ? {
          type: "tv" as const,
          tmdbId,
          season: process.argv[4] ?? "1",
          episode: process.argv[5] ?? "1",
        }
      : { type: "movie" as const, tmdbId };

  console.log("Resolving", params);
  const result = await resolveStream(params);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
