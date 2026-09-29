import { sendInaccuracyReport } from "../../../mail/mail.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";
import type { MutationResolvers } from "../../generated/types.js";

export const reportInaccuracyResolver: MutationResolvers["reportInaccuracy"] =
  async (_parent, { placeId, placeName, message, captchaToken }, { req }) => {
    const ip = clientIp(req);
    await verifyRecaptcha(captchaToken ?? "", "report_inaccuracy", ip);
    consumeRateLimit("reportInaccuracy", ip);

    await sendInaccuracyReport({ placeId, placeName, message });

    return {
      success: true,
      placeName,
    };
  };
