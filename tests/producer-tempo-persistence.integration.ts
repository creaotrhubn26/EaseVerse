/** Run only against a disposable local PostgreSQL database. */
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {upsertLyrics,getLyrics,upsertProTools,getProTools} from '../api/_lib/collab-store';
async function main() {
const connection=process.env.EASEVERSE_TEST_DATABASE_URL;
if(!connection)throw new Error('Set EASEVERSE_TEST_DATABASE_URL to a disposable local database');
const location=new URL(connection);
if(location.hostname!=='127.0.0.1')throw new Error('This integration check requires a local database');
process.env.DATABASE_URL=connection;
const now=new Date().toISOString();
const lyrics={externalTrackId:'tempo-qa',projectId:'tempo-project',title:'Synthetic tempo check',bpm:92.5,lyrics:'Hold the tone',collaborators:[],source:'qa',revision:1,updatedAt:now,receivedAt:now};
await upsertLyrics(lyrics);assert.equal((await getLyrics('tempo-qa')).record?.bpm,92.5);
const snapshot={schemaVersion:1 as const,ownerUserId:'qa-producer',externalTrackId:'tempo-qa',projectId:'tempo-project',source:'qa',bpm:92.5,revision:1,markers:[],takeScores:[],pronunciationFeedback:[],integrationContext:{},updatedAt:now,receivedAt:now};
await upsertProTools(snapshot);assert.equal((await getProTools('tempo-qa','tempo-project','qa-producer')).record?.bpm,92.5);
await upsertProTools({...snapshot,bpm:110,revision:2});
await upsertProTools({...snapshot,bpm:80,revision:1});
assert.equal((await getProTools('tempo-qa','tempo-project','qa-producer')).record?.bpm,110);
assert.equal((await getProTools('tempo-qa','tempo-project','outsider')).record,null);
const pool=new Pool({connectionString:connection});
const types=await pool.query("SELECT table_name,data_type FROM information_schema.columns WHERE table_name IN ('collab_lyrics_drafts','collab_protools_sync') AND column_name='bpm'");
assert.equal(types.rows.length,2);assert.ok(types.rows.every(row=>row.data_type==='numeric'));
await pool.end();console.log('PASS: fractional BPM, newer revision wins, owner isolation, numeric persistence');

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
