import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as workspaceController from '../controllers/workspace.controller.js';

const router: RouterType = Router();

router.use(authenticate);

router.get('/', asyncHandler(workspaceController.listWorkspaces));
router.post('/', asyncHandler(workspaceController.createWorkspace));
router.get('/:workspaceId', asyncHandler(workspaceController.getWorkspace));
router.patch('/:workspaceId', asyncHandler(workspaceController.updateWorkspace));
router.delete('/:workspaceId', asyncHandler(workspaceController.deleteWorkspace));

export default router;
