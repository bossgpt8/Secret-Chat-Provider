import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import ttsRouter from "./tts";
import conversationsRouter from "./conversations";
import gameAssistRouter from "./game-assist";
import memoryRouter from "./memory";
import imagineRouter from "./imagine";
import liveRouter from "./live";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(ttsRouter);
router.use(conversationsRouter);
router.use(gameAssistRouter);
router.use(memoryRouter);
router.use(imagineRouter);
router.use(liveRouter);

export default router;
