import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { env } from "../../../utils/env.utils.js";
import { FROM_EMAIL, FROM_NAME } from "../contactFormResolver/constants/index.js";

/**
 * Tells the suggester their Place is live. A failed send is logged, not
 * thrown: the Place is already created, so failing Publish would only make
 * the admin retry a step that already worked.
 */
export async function sendSuggestionPublishedEmail(
  to: string,
  placeId: string,
): Promise<void> {
  const link = `${env.frontendUrl}/place/${placeId}`;

  const html = `
    <p>Your suggested Place is live on 3.Welle!</p>
    <p><a href="${link}">See it</a> and leave a Rating.</p>
  `;
  const text = `
    Your suggested Place is live on 3.Welle!
    See it and leave a Rating: ${link}
  `;

  try {
    await new MailerSend({
      apiKey: env.mailerSendApiKey,
    }).email.send(
      new EmailParams()
        .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
        .setTo([new Recipient(to)])
        .setSubject("Your Place suggestion is live")
        .setHtml(html)
        .setText(text),
    );
  } catch (error) {
    console.error("Failed to email the suggester about their published Place", error);
  }
}
