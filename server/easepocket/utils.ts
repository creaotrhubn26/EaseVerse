export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stdDev(values: number[], meanValue?: number): number {
  if (values.length <= 1) return 0;
  const m = meanValue ?? mean(values);
  let variance = 0;
  for (const v of values) {
    const d = v - m;
    variance += d * d;
  }
  variance /= values.length;
  return Math.sqrt(variance);
}

export function median(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return 0;
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    arr[i] = values[i] ?? 0;
  }
  arr.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return arr[mid];
  }
  return (arr[mid - 1] + arr[mid]) / 2;
}

export function mad(values: ArrayLike<number>, medianValue?: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const med = medianValue ?? median(values);
  const deviations = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    deviations[i] = Math.abs((values[i] ?? 0) - med);
  }
  return median(deviations);
}

