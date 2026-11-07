const DEFAULT_MAX_SAMPLES = 50_000;
const MAX_QUERY_SAMPLES = 100_000;
const EPSILON = 1e-9;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};
const parseTimestamp = (value) => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp))
        throw new Error(`invalid ISO timestamp: ${value}`);
    return timestamp;
};
const validateRange = (query) => {
    const from = parseTimestamp(query.from);
    const to = parseTimestamp(query.to);
    if (from >= to)
        throw new Error('historical query requires from < to');
    return { from, to };
};
const boundedLimit = (limit) => Math.min(Math.max(1, Math.floor(limit ?? DEFAULT_MAX_SAMPLES)), MAX_QUERY_SAMPLES);
const cloneMeasurement = (measurement) => ({
    ...measurement,
    ...(measurement.metadata ? { metadata: { ...measurement.metadata } } : {}),
});
const percentile = (values, rank) => {
    if (!values.length)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * rank;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper)
        return round(sorted[lower]);
    return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
};
const average = (values) => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const validateMeasurement = (measurement) => {
    parseTimestamp(measurement.timestamp);
    if (!measurement.probeType.trim())
        throw new Error('probeType is required');
    if (measurement.latencyMs !== undefined &&
        (!Number.isFinite(measurement.latencyMs) || measurement.latencyMs < 0))
        throw new Error('latencyMs must be a non-negative finite number');
    if (measurement.packetLossPercent !== undefined &&
        (!Number.isFinite(measurement.packetLossPercent) ||
            measurement.packetLossPercent < 0 ||
            measurement.packetLossPercent > 100))
        throw new Error('packetLossPercent must be between 0 and 100');
};
const summarize = (measurements) => {
    const latency = measurements.flatMap((item) => item.latencyMs === undefined ? [] : [item.latencyMs]);
    const packetLoss = measurements.flatMap((item) => item.packetLossPercent === undefined ? [] : [item.packetLossPercent]);
    const successCount = measurements.filter((item) => item.success).length;
    return {
        sampleCount: measurements.length,
        successCount,
        availabilityPercent: measurements.length
            ? round((successCount / measurements.length) * 100)
            : null,
        averageLatencyMs: average(latency),
        p50LatencyMs: percentile(latency, 0.5),
        p95LatencyMs: percentile(latency, 0.95),
        p99LatencyMs: percentile(latency, 0.99),
        averagePacketLossPercent: average(packetLoss),
    };
};
const chooseBucketSize = (durationMs) => {
    if (durationMs <= DAY_MS)
        return 'hour';
    if (durationMs <= 7 * DAY_MS)
        return 'six-hour';
    if (durationMs <= 30 * DAY_MS)
        return 'day';
    return 'week';
};
const bucketDurationMs = (size) => size === 'hour'
    ? HOUR_MS
    : size === 'six-hour'
        ? 6 * HOUR_MS
        : size === 'day'
            ? DAY_MS
            : 7 * DAY_MS;
const buildBuckets = (measurements, from, to, bucketSize) => {
    const duration = bucketDurationMs(bucketSize);
    const buckets = [];
    for (let start = from; start < to; start += duration) {
        const end = Math.min(start + duration, to);
        const items = measurements.filter((item) => {
            const timestamp = Date.parse(item.timestamp);
            return timestamp >= start && timestamp < end;
        });
        const summary = summarize(items);
        buckets.push({
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            sampleCount: summary.sampleCount,
            successCount: summary.successCount,
            availabilityPercent: summary.availabilityPercent ?? 0,
            averageLatencyMs: summary.averageLatencyMs,
            p50LatencyMs: summary.p50LatencyMs,
            p95LatencyMs: summary.p95LatencyMs,
            p99LatencyMs: summary.p99LatencyMs,
            averagePacketLossPercent: summary.averagePacketLossPercent,
        });
    }
    return buckets;
};
const trendValue = (metric, measurement) => metric === 'availability'
    ? measurement.success
        ? 100
        : 0
    : metric === 'latency'
        ? measurement.latencyMs
        : measurement.packetLossPercent;
const calculateTrend = (metric, measurements) => {
    const points = measurements.flatMap((item) => {
        const value = trendValue(metric, item);
        return value === undefined || !Number.isFinite(value)
            ? []
            : [{ x: Date.parse(item.timestamp), y: value }];
    });
    if (points.length < 2)
        return {
            metric,
            direction: 'insufficient-data',
            slopePerHour: null,
            changePercent: null,
            confidence: 0,
            firstValue: points[0]?.y ?? null,
            lastValue: points[points.length - 1]?.y ?? null,
            sampleCount: points.length,
        };
    const first = points[0].y;
    const last = points[points.length - 1].y;
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    const covariance = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
    const slopePerMs = denominator > EPSILON ? covariance / denominator : 0;
    const slopePerHour = slopePerMs * HOUR_MS;
    const totalVariance = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    const residualVariance = points.reduce((sum, point) => sum + (point.y - (meanY + slopePerMs * (point.x - meanX))) ** 2, 0);
    const rSquared = totalVariance > EPSILON ? clamp(1 - residualVariance / totalVariance) : 1;
    const changePercent = Math.abs(first) > EPSILON ? round(((last - first) / Math.abs(first)) * 100) : null;
    const meaningfulSlope = Math.abs(slopePerHour) < 0.001 || rSquared < 0.25 ? 0 : slopePerHour;
    const direction = meaningfulSlope === 0
        ? 'stable'
        : metric === 'availability'
            ? meaningfulSlope > 0
                ? 'improving'
                : 'worsening'
            : meaningfulSlope < 0
                ? 'improving'
                : 'worsening';
    return {
        metric,
        direction,
        slopePerHour: round(slopePerHour, 4),
        changePercent,
        confidence: round(rSquared * 100),
        firstValue: round(first),
        lastValue: round(last),
        sampleCount: points.length,
    };
};
const createSeries = (probeType, measurements, from, to, bucketSize) => ({
    probeType,
    summary: summarize(measurements),
    buckets: buildBuckets(measurements, from, to, bucketSize),
    trends: [
        calculateTrend('availability', measurements),
        calculateTrend('latency', measurements),
        calculateTrend('packetLoss', measurements),
    ],
});
export class InMemoryHistoricalMeasurementStore {
    measurements = [];
    constructor(measurements = []) {
        measurements.forEach((measurement) => this.add(measurement));
    }
    add(measurement) {
        validateMeasurement(measurement);
        this.measurements.push(cloneMeasurement(measurement));
    }
    async query(query) {
        const { from, to } = validateRange(query);
        const limit = boundedLimit(query.limit);
        const probeTypes = query.probeTypes ? new Set(query.probeTypes) : undefined;
        return this.measurements
            .filter((item) => {
            const timestamp = Date.parse(item.timestamp);
            return (timestamp >= from && timestamp < to && (!probeTypes || probeTypes.has(item.probeType)));
        })
            .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
            .slice(0, limit)
            .map(cloneMeasurement);
    }
}
export class PostgresHistoricalMeasurementStore {
    client;
    constructor(client) {
        this.client = client;
    }
    async query(query) {
        const { from, to } = validateRange(query);
        const limit = boundedLimit(query.limit);
        const rows = await this.client.$queryRaw `
      SELECT id, timestamp, "probeType", success, latency, metadata
      FROM "NetworkMeasurement"
      WHERE timestamp >= ${new Date(from)} AND timestamp < ${new Date(to)}
      ORDER BY timestamp ASC LIMIT ${limit}
    `;
        if (!Array.isArray(rows))
            throw new Error('historical measurement query returned an invalid result');
        const probeTypes = query.probeTypes ? new Set(query.probeTypes) : undefined;
        return rows.flatMap((row) => {
            if (!row || typeof row !== 'object')
                return [];
            const record = row;
            const probeType = typeof record.probeType === 'string' ? record.probeType : '';
            if (!probeType || (probeTypes && !probeTypes.has(probeType)))
                return [];
            const metadata = record.metadata && typeof record.metadata === 'object'
                ? record.metadata
                : undefined;
            const packetLoss = metadata?.packetLossPercent;
            const measurement = {
                timestamp: record.timestamp instanceof Date
                    ? record.timestamp.toISOString()
                    : String(record.timestamp),
                probeType,
                success: record.success === true,
                ...(typeof record.id === 'string' ? { id: record.id } : {}),
                ...(typeof record.latency === 'number' ? { latencyMs: record.latency } : {}),
                ...(typeof packetLoss === 'number' ? { packetLossPercent: packetLoss } : {}),
                ...(metadata ? { metadata } : {}),
            };
            validateMeasurement(measurement);
            return [measurement];
        });
    }
}
export const createHistoricalReport = async (store, query, options = {}) => {
    const { from, to } = validateRange(query);
    const maxSamples = boundedLimit(options.maxSamples);
    const measurements = (await store.query({ ...query, limit: Math.min(query.limit ?? maxSamples, maxSamples) }))
        .map(cloneMeasurement)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    measurements.forEach(validateMeasurement);
    const bucketSize = chooseBucketSize(to - from);
    const probeTypes = [...new Set(measurements.map((item) => item.probeType))].sort();
    return {
        generatedAt: (options.now ?? (() => new Date()))().toISOString(),
        range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
        bucketSize,
        summary: summarize(measurements),
        buckets: buildBuckets(measurements, from, to, bucketSize),
        trends: [
            calculateTrend('availability', measurements),
            calculateTrend('latency', measurements),
            calculateTrend('packetLoss', measurements),
        ],
        series: probeTypes.map((probeType) => createSeries(probeType, measurements.filter((item) => item.probeType === probeType), from, to, bucketSize)),
    };
};
const csvEscape = (value) => {
    const text = value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export const exportHistoricalReportCsv = (report) => {
    const lines = [
        'probeType,bucketStart,bucketEnd,sampleCount,successCount,availabilityPercent,averageLatencyMs,p50LatencyMs,p95LatencyMs,p99LatencyMs,averagePacketLossPercent',
    ];
    for (const series of report.series)
        for (const bucket of series.buckets)
            lines.push([
                csvEscape(series.probeType),
                bucket.start,
                bucket.end,
                bucket.sampleCount,
                bucket.successCount,
                bucket.availabilityPercent,
                bucket.averageLatencyMs,
                bucket.p50LatencyMs,
                bucket.p95LatencyMs,
                bucket.p99LatencyMs,
                bucket.averagePacketLossPercent,
            ].join(','));
    return `${lines.join('\n')}\n`;
};
export const exportHistoricalReportJson = (report) => `${JSON.stringify(report, null, 2)}\n`;
//# sourceMappingURL=index.js.map