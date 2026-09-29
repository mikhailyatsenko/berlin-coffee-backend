import { EmailParams, MailerSend, Recipient, Sender } from "mailersend";
import { config } from "../config/config.js";

export interface Mail {
  from: { email: string; name: string };
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

/** Hands a mail over for delivery; rejects if it could not. */
export interface MailTransport {
  send(mail: Mail): Promise<void>;
}

const mailerSendTransport = (apiKey: string): MailTransport => {
  const client = new MailerSend({ apiKey });
  return {
    async send(mail) {
      const params = new EmailParams()
        .setFrom(new Sender(mail.from.email, mail.from.name))
        .setTo([new Recipient(mail.to)])
        .setSubject(mail.subject)
        .setHtml(mail.html)
        .setText(mail.text);
      if (mail.replyTo) params.setReplyTo(new Recipient(mail.replyTo));
      await client.email.send(params);
    },
  };
};

let transport: MailTransport = mailerSendTransport(config.mailerSendApiKey);

export const mailTransport = () => transport;

/** Tests swap MailerSend for a fake here. */
export function setMailTransport(next: MailTransport): void {
  transport = next;
}
