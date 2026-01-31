import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import {
  ADMIN_EMAIL,
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";

export async function reportInaccuracyResolver(
  _: never,
  {
    placeId,
    placeName,
    message,
  }: { placeId: string; placeName: string; message: string },
) {
  if (!process.env.MAILERSEND_API_KEY) {
    throw new Error("MAILERSEND_API_KEY is not defined");
  }
  const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY,
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

  try {
    await mailerSend.email.send(adminEmailParams);
  } catch (error) {
    console.error(error);
    throw new Error("Failed to send email");
  }

  return {
    success: true,
    placeName,
  };
}
