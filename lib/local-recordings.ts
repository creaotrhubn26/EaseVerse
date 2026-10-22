// Web URLs belong to the browser's recording/storage implementation.
export async function preserveLocalRecordingUri(uri: string): Promise<string> { return uri; }
export async function preserveNewLocalRecordingUri(uri:string,_takeId:string):Promise<string>{return uri;}
