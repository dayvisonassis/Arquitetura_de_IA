import { Router } from 'express';
import { HomeController } from '../controllers/home.controller';
import { UserController } from '../controllers/user.controller';

const router = Router();

router.get('/', HomeController.index);

router.get('/users', UserController.index);
router.post('/users', UserController.create);
router.get('/users/:id', UserController.show);

export default router;
