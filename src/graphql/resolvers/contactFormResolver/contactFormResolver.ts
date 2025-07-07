import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import {
  ADMIN_EMAIL,
  ADMIN_MESSAGE_HTML,
  ADMIN_MESSAGE_SUBJECT,
  ADMIN_MESSAGE_TEXT,
  CUSTOMER_MESSAGE_HTML,
  CUSTOMER_MESSAGE_SUBJECT,
  CUSTOMER_MESSAGE_TEXT,
  FROM_EMAIL,
  FROM_NAME,
} from "./constants/index.js";
export async function contactFormResolver(
  _: never,
  { name, email, message }: { name: string; email: string; message: string },
) {
  if (!process.env.MAILERSEND_API_KEY) {
    throw new Error("MAILERSEND_API_KEY is not defined");
  }
  const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY,
  });
  const adminEmailParams = new EmailParams()
    .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
    .setTo([new Recipient(ADMIN_EMAIL)])
    .setSubject(ADMIN_MESSAGE_SUBJECT)
    .setHtml(
      ADMIN_MESSAGE_HTML.replace("{{name}}", name)
        .replace("{{email}}", email)
        .replace("{{message}}", message),
    )
    .setText(
      ADMIN_MESSAGE_TEXT.replace("{{name}}", name)
        .replace("{{email}}", email)
        .replace("{{message}}", message),
    );

  const customerEmailParams = new EmailParams()
    .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
    .setTo([new Recipient(email)])
    .setSubject(CUSTOMER_MESSAGE_SUBJECT)
    .setHtml(CUSTOMER_MESSAGE_HTML.replace("{{name}}", name))
    .setText(CUSTOMER_MESSAGE_TEXT.replace("{{name}}", name));

  try {
    await mailerSend.email.send(adminEmailParams);
    await mailerSend.email.send(customerEmailParams);
  } catch (error) {
    console.error(error);
    throw new Error("Failed to send email");
  }

  return {
    success: true,
    name,
  };
}
