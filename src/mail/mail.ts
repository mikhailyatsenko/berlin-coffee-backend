/**
 * Every mail the app sends. Resolvers decide who gets which mail; this module
 * owns the templates, the sender and the admin address.
 *
 * HTML bodies go through `html`, which escapes every interpolation; text parts
 * are plain; subjects are fixed strings, never user input.
 *
 * A failed send is handled by the mail's role:
 * - the mail *is* the operation (contact message, inaccuracy report): it
 *   throws, and the error contract masks it as INTERNAL_SERVER_ERROR;
 * - the mail follows state that is already saved (confirmation, password
 *   reset, suggestion mails): it is logged and the operation succeeds.
 *
 * Mail to an address the caller typed (confirmation, password reset) is capped
 * per recipient, so the site can't be used to flood a mailbox. The cap is
 * counted here, so no caller can skip it; resolvers ask first, before they
 * write the state the mail is about.
 */
import { config } from "../config/config.js";
import { html, type SafeHtml } from "./html.js";
import { mailTransport } from "./transport.js";
import {
  checkRateLimit,
  countRateLimit,
  emailKey,
  isRateLimited,
} from "../utils/rateLimit.js";

export const FROM_EMAIL = "support@3welle.com";
export const FROM_NAME = "3 Welle";

interface Content {
  to: string;
  replyTo?: string;
  subject: string;
  html: SafeHtml;
  text: string;
}

const send = (content: Content): Promise<void> =>
  mailTransport().send({
    ...content,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    html: content.html.value,
  });

const sendBestEffort = async (
  content: Content,
  what: string,
): Promise<void> => {
  try {
    await send(content);
  } catch (error) {
    console.error(`Failed to send ${what}`, error);
  }
};

/** Whether this address may get another mail now; for a caller that answers silently. */
export const recipientAllowed = (email: string): boolean =>
  !isRateLimited("mailRecipient", emailKey(email));

/** Throws RATE_LIMITED if this address may not get another mail now. */
export const assertRecipientAllowed = (email: string): void =>
  checkRateLimit("mailRecipient", emailKey(email));

/**
 * Best-effort, and counted against the recipient's cap. An exhausted cap
 * skips the mail; callers that asked first only get here in a race.
 */
const sendToCallerAddress = async (
  content: Content,
  what: string,
): Promise<void> => {
  const recipient = emailKey(content.to);
  if (isRateLimited("mailRecipient", recipient)) {
    console.warn(`Not sending ${what}: the recipient's limit is reached`);
    return;
  }
  countRateLimit("mailRecipient", recipient);
  await sendBestEffort(content, what);
};

/** Registration, a resend and an email change all confirm an address this way. Best-effort. */
export const sendEmailConfirmation = (to: string, url: string) =>
  sendToCallerAddress(
    {
      to,
      subject: "Confirm your email on 3.Welle",
      html: html`<p>Hi there!</p>
        <p>Please confirm your email address for <strong>3.Welle</strong>.</p>
        <p><a href="${url}">Confirm your email</a></p>
        <p>
          This link is valid for 1 hour. If you didn't ask for this, please
          ignore this email.
        </p>
        <p>Best regards,<br />The 3.Welle Team</p>`,
      text: `Hi there!

Please confirm your email address for 3.Welle.

Confirm your email: ${url} (valid for 1 hour)

If you didn't ask for this, please ignore this email.

Best regards,
The 3.Welle Team`,
    },
    "an email confirmation",
  );

/** Best-effort. */
export const sendPasswordReset = (to: string, url: string) =>
  sendToCallerAddress(
    {
      to,
      subject: "Reset your password on 3.Welle",
      html: html`<p>
          You (or someone else) requested to reset the password for your 3.Welle
          account.
        </p>
        <p>
          If it was you, click <a href="${url}">this link</a> to set a new
          password. The link is valid for 1 hour.
        </p>
        <p>
          If you did not request this, you can safely ignore this message.
        </p>`,
      text: `You (or someone else) requested to reset the password for your 3.Welle account.

Reset link: ${url}
This link is valid for 1 hour. If you didn't request this, ignore this email.`,
    },
    "a password reset",
  );

/** To the admin, replying to the submitter. Throws: the mail is the operation. */
export const sendContactMessage = ({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}) =>
  send({
    to: config.adminEmail,
    replyTo: email,
    subject: "New contact form submission",
    html: html`<p>New contact form submission</p>
      <p>Name: ${name}</p>
      <p>Email: ${email}</p>
      <p>Message: ${message}</p>`,
    text: `New contact form submission
Name: ${name}
Email: ${email}
Message: ${message}`,
  });

/** To the admin. Throws: the mail is the operation. */
export const sendInaccuracyReport = ({
  placeId,
  placeName,
  message,
}: {
  placeId: string;
  placeName: string;
  message: string;
}) =>
  send({
    to: config.adminEmail,
    subject: "New 3.Welle inaccuracy report",
    html: html`<p>New inaccuracy report</p>
      <p>Place ID: ${placeId}</p>
      <p>Place Name: ${placeName}</p>
      <p>Message: ${message}</p>`,
    text: `New inaccuracy report
Place ID: ${placeId}
Place Name: ${placeName}
Message: ${message}`,
  });

/**
 * Tells the admin about a new suggestion. Best-effort: the suggestion is
 * already saved, so failing the submission would only make the person send
 * it again.
 */
export const sendSuggestionToAdmin = ({
  name,
  address,
  suggestedBy,
  reviewUrl,
}: {
  name: string;
  address: string;
  suggestedBy: "user" | "guest";
  reviewUrl: string;
}) => {
  const who = suggestedBy === "user" ? "a User" : "a Guest";
  return sendBestEffort(
    {
      to: config.adminEmail,
      subject: "New 3.Welle Place suggestion",
      html: html`<p>New Place suggestion</p>
        <p>Name: ${name}</p>
        <p>Address: ${address}</p>
        <p>Suggested by ${who}</p>
        <p><a href="${reviewUrl}">Review it</a></p>`,
      text: `New Place suggestion
Name: ${name}
Address: ${address}
Suggested by ${who}
Review it: ${reviewUrl}`,
    },
    "the admin a Place suggestion",
  );
};

/**
 * Tells the suggester their Place is live. Best-effort: the Place is already
 * created, so failing Publish would only make the admin retry a step that
 * already worked. Not capped per recipient: it goes to a User's confirmed
 * address, and only when the admin publishes.
 */
export const sendSuggestionPublished = (to: string, placeUrl: string) =>
  sendBestEffort(
    {
      to,
      subject: "Your Place suggestion is live",
      html: html`<p>Your suggested Place is live on 3.Welle!</p>
        <p><a href="${placeUrl}">See it</a> and leave a Rating.</p>`,
      text: `Your suggested Place is live on 3.Welle!
See it and leave a Rating: ${placeUrl}`,
    },
    "the suggester their published Place",
  );
