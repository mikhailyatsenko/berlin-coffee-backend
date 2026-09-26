import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import validator from "validator";
import { env } from "../../../utils/env.utils.js";
import { signReviewToken } from "../../../utils/placeSuggestionToken.js";
import {
  ADMIN_EMAIL,
  FROM_EMAIL,
  FROM_NAME,
} from "../contactFormResolver/constants/index.js";

interface SuggestionToAnnounce {
  id: string;
  name: string;
  address: string;
  suggestedBy: "user" | "guest";
}

export const reviewLinkFor = (suggestionId: string) =>
  `${env.frontendUrl}/suggestions/${suggestionId}/review?token=${signReviewToken(suggestionId)}`;

/**
 * Tells the admin about a new suggestion. A failed send is logged, not thrown:
 * the suggestion is already saved, so failing the submission would only make
 * the person send it again.
 */
export async function sendAdminSuggestionEmail(
  suggestion: SuggestionToAnnounce,
): Promise<void> {
  const { name, address, suggestedBy } = suggestion;
  const link = reviewLinkFor(suggestion.id);
  const who = suggestedBy === "user" ? "a User" : "a Guest";

  // Name and address are typed by anyone, so they are escaped in the HTML body.
  const html = `
    <p>New Place suggestion</p>
    <p>Name: ${validator.escape(name)}</p>
    <p>Address: ${validator.escape(address)}</p>
    <p>Suggested by ${who}</p>
    <p><a href="${link}">Review it</a></p>
  `;
  const text = `
    New Place suggestion
    Name: ${name}
    Address: ${address}
    Suggested by ${who}
    Review it: ${link}
  `;

  try {
    await new MailerSend({
      apiKey: process.env.MAILERSEND_API_KEY as string,
    }).email.send(
      new EmailParams()
        .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
        .setTo([new Recipient(ADMIN_EMAIL)])
        .setSubject("New 3.Welle Place suggestion")
        .setHtml(html)
        .setText(text),
    );
  } catch (error) {
    console.error("Failed to email the admin about a Place suggestion", error);
  }
}
