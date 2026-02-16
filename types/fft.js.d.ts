declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);

    size: number;

    createComplexArray(): number[];
    toComplexArray(real: ArrayLike<number>, complex?: number[]): number[];
    realTransform(out: number[], data: ArrayLike<number>): void;
    completeSpectrum(out: number[]): void;
    transform(out: number[], data: number[]): void;
  }
}

