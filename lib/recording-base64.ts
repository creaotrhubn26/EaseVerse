export async function recordingBase64(uri:string):Promise<string>{
 const response=await fetch(uri);if(!response.ok)throw new Error('Could not read this recording.');
 const blob=await response.blob();if(blob.size>3_000_000)throw new Error('Choose a recording smaller than 3 MB for cloud analysis.');
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read this recording.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');reader.readAsDataURL(blob);});
}
