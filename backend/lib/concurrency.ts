/**
 * Runs an async mapper over items with a bounded number of in-flight tasks.
 * Results keep the input order, so callers stay deterministic even though the
 * work is concurrent. The first rejection aborts the remaining work.
 */
export const mapWithConcurrency = async <T, R>(
    items: readonly T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
    if (items.length === 0) return [];

    const results = new Array<R>(items.length);
    const workerCount = Math.min(Math.max(1, limit), items.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            results[index] = await mapper(items[index], index);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
};
