import { resolveNativeIntent } from '@/lib/native-intent';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  return resolveNativeIntent(path, initial);
}
