import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import {
  ADMIN_EMAIL,
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";
import { clientIp } from "../../../utils/rateLimit.js";
import { verifyRecaptcha } from "../../../utils/verifyRecaptcha.js";
import type { MutationResolvers } from "../../generated/types.js";
import { config } from "../../../config/config.js";

export const reportInaccuracyResolver: MutationResolvers["reportInaccuracy"] =
  async (_parent, { placeId, placeName, message, captchaToken }, { req }) => {
    await verifyRecaptcha(
      captchaToken ?? "",
      "report_inaccuracy",
      clientIp(req),
    );

    const mailerSend = new MailerSend({
      apiKey: config.mailerSendApiKey,
    });

    const ADMIN_MESSAGE_SUBJECT = "New 3.Welle inaccuracy report";
    const ADMIN_MESSAGE_HTML = `
    <p>New inaccuracy report</p>
    <p>Place ID: ${placeId}</p>
    <p>Place Name: ${placeName}</p>
    <p>Message: ${message}</p>
  `;
    const ADMIN_MESSAGE_TEXT = `
    New inaccuracy report
    Place ID: ${placeId}
    Place Name: ${placeName}
    Message: ${message}
  `;

    const adminEmailParams = new EmailParams()
      .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
      .setTo([new Recipient(ADMIN_EMAIL)])
      .setSubject(ADMIN_MESSAGE_SUBJECT)
      .setHtml(ADMIN_MESSAGE_HTML)
      .setText(ADMIN_MESSAGE_TEXT);

    await mailerSend.email.send(adminEmailParams);

    return {
      success: true,
      placeName,
    };
  };
