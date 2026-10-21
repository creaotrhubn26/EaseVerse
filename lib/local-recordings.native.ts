import * as Files from 'expo-file-system/legacy';
import { preserveRecording } from './local-recording-paths';
export async function preserveLocalRecordingUri(uri: string): Promise<string> {
  return preserveRecording(uri, {
    documents: Files.documentDirectory ?? '', cache: Files.cacheDirectory ?? '',
    info: Files.getInfoAsync,
    mkdir: path => Files.makeDirectoryAsync(path, { intermediates: true }),
    copy: (from, to) => Files.copyAsync({ from, to }),
  });
}
