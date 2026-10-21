import {File} from 'expo-file-system';
export async function recordingBase64(uri:string):Promise<string>{
 if(!/^(file|content):\/\//.test(uri))throw new Error('This is not a local recording.');
 const file=new File(uri);if(!file.exists)throw new Error('Could not find this recording.');
 if(file.size>3_000_000)throw new Error('Choose a recording smaller than 3 MB for cloud analysis.');
 return file.base64();
}
