import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import ttsRouter from "./tts";
import conversationsRouter from "./conversations";
import gameAssistRouter from "./game-assist";
import memoryRouter from "./memory";
import imagineRouter from "./imagine";
import liveRouter from "./live";
import devicesRouter from "./devices";
import accountRouter from "./account";
import { requirePrivateDevice } from "../lib/private-access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(chatRouter);
router.use(ttsRouter);
router.use("/conversations", requirePrivateDevice);
router.use(conversationsRouter);
router.use(gameAssistRouter);
router.use("/memory", requirePrivateDevice);
router.use(memoryRouter);
router.use(imagineRouter);
router.use(liveRouter);
router.use(devicesRouter);

export default router;
