import { Platform } from 'react-native';
import { isIPadFromNavigator } from './device-web';

export function isIPadLike(): boolean {
  if (Platform.OS === 'ios' && Platform.isPad === true) return true;
  if (Platform.OS !== 'web') return false;
  return isIPadFromNavigator();
}
