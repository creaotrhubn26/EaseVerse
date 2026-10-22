import type {VercelRequest, VercelResponse} from '@vercel/node';
import {requireAuth, getAuthenticatedUser} from '../_lib/auth.js';
import {easeVersePublicOrigin} from '../_lib/auth-upstream.js';
import {requestAccountDeletion} from '../_lib/account-deletion-db.js';

export function createDeletionRequestHandler(deps = {auth: requireAuth, actor: getAuthenticatedUser, save: requestAccountDeletion}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') {res.setHeader('Allow', 'POST'); return res.status(405).json({error: 'method_not_allowed'});}
    const origin = req.headers.origin;
    if ((origin && origin !== easeVersePublicOrigin(req)) || (!origin && !/^Bearer\s+\S+$/i.test(String(req.headers.authorization ?? '')))) {
      return res.status(403).json({error: 'invalid_request_origin'});
    }
    if (req.body?.confirmation !== 'DELETE MY ACCOUNT') return res.status(400).json({error: 'confirmation_required'});
    try {
      const userId = await deps.auth(req, res);
      if (!userId) return;
      const actor = deps.actor(req);
      if (!actor || actor.id !== userId || !actor.email) return res.status(401).json({error: 'account_unavailable'});
      // Identity comes exclusively from the validated session, never the request body.
      const request = await deps.save(userId, actor.email);
      return res.status(202).json({request: {id: request.id, requestedAt: request.requestedAt}, status: 'requested'});
    } catch {
      return res.status(503).json({error: 'deletion_request_unavailable'});
    }
  };
}
export default createDeletionRequestHandler();
