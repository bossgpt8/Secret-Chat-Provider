import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import ttsRouter from "./tts";
import conversationsRouter from "./conversations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(ttsRouter);
router.use(conversationsRouter);

export default router;
