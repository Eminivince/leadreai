import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as workspaceController from '../controllers/workspace.controller.js';

const router: RouterType = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', asyncHandler(workspaceController.listWorkspaces));
router.post('/', asyncHandler(workspaceController.createWorkspace));
router.get('/:workspaceId', asyncHandler(workspaceController.getWorkspace));
router.patch('/:workspaceId', authorize(['owner', 'admin']), asyncHandler(workspaceController.updateWorkspace));
router.delete('/:workspaceId', asyncHandler(workspaceController.deleteWorkspace));

router.get(
  '/:workspaceId/knowledge-base',
  authorize(['owner', 'admin']),
  asyncHandler(workspaceController.listKnowledgeBase)
);
router.post(
  '/:workspaceId/knowledge-base',
  authorize(['owner', 'admin']),
  asyncHandler(workspaceController.createKnowledgeBaseEntry)
);
router.patch(
  '/:workspaceId/knowledge-base/:entryId',
  authorize(['owner', 'admin']),
  asyncHandler(workspaceController.updateKnowledgeBaseEntry)
);
router.delete(
  '/:workspaceId/knowledge-base/:entryId',
  authorize(['owner', 'admin']),
  asyncHandler(workspaceController.deleteKnowledgeBaseEntry)
);

// Email config — owner-only (secrets stored here)
router.get(
  '/:workspaceId/email-config',
  authorize(['owner', 'admin']),
  asyncHandler(workspaceController.getEmailConfig)
);
router.put(
  '/:workspaceId/email-config',
  authorize(['owner']),
  asyncHandler(workspaceController.updateEmailConfig)
);
router.delete(
  '/:workspaceId/email-config',
  authorize(['owner']),
  asyncHandler(workspaceController.deleteEmailConfig)
);

// API key management — owner + admin can list, only owner can create/revoke
router.get(
  '/:workspaceId/api-keys',
  authorize(['owner', 'admin']),
  asyncHandler(workspaceController.listApiKeys)
);
router.post(
  '/:workspaceId/api-keys',
  authorize(['owner']),
  asyncHandler(workspaceController.createApiKey)
);
router.delete(
  '/:workspaceId/api-keys/:keyId',
  authorize(['owner']),
  asyncHandler(workspaceController.revokeApiKey)
);

export default router;
