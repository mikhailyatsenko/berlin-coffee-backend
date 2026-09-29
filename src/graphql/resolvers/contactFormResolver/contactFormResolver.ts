import isEmail from "validator/lib/isEmail.js";
import { badInput } from "../../errors.js";
import { sendContactMessage } from "../../../mail/mail.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";
import type { MutationResolvers } from "../../generated/types.js";

export const contactFormResolver: MutationResolvers["contactForm"] = async (
  _parent,
  { name, email, message, captchaToken },
  { req },
) => {
  // The admin replies to it, so a malformed one would only fail the send.
  if (!isEmail(email)) {
    throw badInput("Invalid email address");
  }

  const ip = clientIp(req);
  await verifyRecaptcha(captchaToken ?? "", "contact_form", ip);
  consumeRateLimit("contactForm", ip);

  await sendContactMessage({ name, email, message });

  return {
    success: true,
    name,
  };
};
