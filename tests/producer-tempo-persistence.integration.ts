/** Run only against a disposable local PostgreSQL database. */
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {upsertLyrics,getLyrics,upsertProTools,getProTools} from '../api/_lib/collab-store';
import {createLiveSession,armRecording,updateSessionBpm,getLiveSession} from '../api/_lib/sessions-db';
async function main() {
const connection=process.env.EASEVERSE_TEST_DATABASE_URL;
if(!connection)throw new Error('Set EASEVERSE_TEST_DATABASE_URL to a disposable local database');
const location=new URL(connection);
if(location.hostname!=='127.0.0.1')throw new Error('This integration check requires a local database');
process.env.DATABASE_URL=connection;
const now=new Date().toISOString();
const trackId=`tempo-qa-${Date.now()}`;
const lyrics={externalTrackId:trackId,projectId:'tempo-project',title:'Synthetic tempo check',bpm:92.5,lyrics:'Hold the tone',collaborators:[],source:'qa',revision:1,updatedAt:now,receivedAt:now};
await upsertLyrics(lyrics);assert.equal((await getLyrics(trackId)).record?.bpm,92.5);
const snapshot={schemaVersion:1 as const,ownerUserId:'qa-producer',externalTrackId:trackId,projectId:'tempo-project',source:'qa',bpm:92.5,revision:1,markers:[],takeScores:[],pronunciationFeedback:[],integrationContext:{},updatedAt:now,receivedAt:now};
await upsertProTools(snapshot);assert.equal((await getProTools(trackId,'tempo-project','qa-producer')).record?.bpm,92.5);
await upsertProTools({...snapshot,bpm:110,revision:2});
await upsertProTools({...snapshot,bpm:80,revision:1});
assert.equal((await getProTools(trackId,'tempo-project','qa-producer')).record?.bpm,110);
assert.equal((await getProTools(trackId,'tempo-project','outsider')).record,null);
const pool=new Pool({connectionString:connection});
await pool.query(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY);
  INSERT INTO projects(id) VALUES ('tempo-project') ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS live_sessions (
    id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),external_track_id TEXT,
    started_by_user_id TEXT NOT NULL,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',bpm INTEGER);`);
const live=await createLiveSession({projectId:'tempo-project',externalTrackId:trackId,startedByUserId:'qa-producer'});
assert.ok(live);
await armRecording({sessionId:live.id,userId:'qa-producer',countdownSec:0,bpm:92.5,clickOn:true});
assert.equal((await getLiveSession(live.id))?.bpm,92.5);
await updateSessionBpm({sessionId:live.id,userId:'qa-producer',bpm:110.25});
assert.equal((await getLiveSession(live.id))?.bpm,110.25);
const types=await pool.query("SELECT table_name,data_type FROM information_schema.columns WHERE table_name IN ('collab_lyrics_drafts','collab_protools_sync') AND column_name='bpm'");
assert.equal(types.rows.length,2);assert.ok(types.rows.every(row=>row.data_type==='numeric'));
const liveType=await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name='live_sessions' AND column_name='bpm'");
assert.equal(liveType.rows[0]?.data_type,'numeric');
await pool.end();console.log('PASS: fractional BPM, newer revision wins, owner isolation, numeric persistence including live sessions');

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
