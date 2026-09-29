import { sendContactMessage } from "../../../mail/mail.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";
import type { MutationResolvers } from "../../generated/types.js";

export const contactFormResolver: MutationResolvers["contactForm"] = async (
  _parent,
  { name, email, message, captchaToken },
  { req },
) => {
  const ip = clientIp(req);
  await verifyRecaptcha(captchaToken ?? "", "contact_form", ip);
  consumeRateLimit("contactForm", ip);

  await sendContactMessage({ name, email, message });

  return {
    success: true,
    name,
  };
};
