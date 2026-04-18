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

export default router;
