/** Longest-first allocation of whole, unspliced runs onto stock of one length. */
export function packRuns<T extends { length: number }>(
  runs: T[],
  stock: number,
) {
  const tolerance = 1e-7;
  const bins: { left: number; runs: T[] }[] = [];
  const oversized: T[] = [];
  for (const run of [...runs].sort((a, b) => b.length - a.length)) {
    if (run.length > stock + tolerance) {
      oversized.push(run);
      continue;
    }
    let bin = bins.find((item) => item.left >= run.length - tolerance);
    if (!bin) {
      bin = { left: stock, runs: [] };
      bins.push(bin);
    }
    bin.runs.push(run);
    bin.left = Math.max(0, bin.left - run.length);
  }
  return { bins, oversized };
}
