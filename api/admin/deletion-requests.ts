import type {VercelRequest, VercelResponse} from '@vercel/node';
import {requireAuth} from '../_lib/auth.js';
import {getUser} from '../_lib/users-db.js';
import {listAccountDeletionRequests} from '../_lib/account-deletion-db.js';

export function createDeletionQueueHandler(deps = {auth: requireAuth, user: getUser, list: listAccountDeletionRequests}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'GET') {res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'method_not_allowed'});}
    try {
      const id = await deps.auth(req, res);
      if (!id) return;
      if ((await deps.user(id))?.status !== 'admin') return res.status(403).json({error: 'admin_only'});
      return res.json({requests: await deps.list()});
    } catch {return res.status(503).json({error: 'deletion_queue_unavailable'});}
  };
}
export default createDeletionQueueHandler();
