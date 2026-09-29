import type { Mail, MailTransport } from "../../src/mail/transport.js";

/**
 * A transport that keeps every mail instead of sending it, or fails every send
 * while `fails` is set. Install it with setMailTransport once the app modules
 * are imported (after setTestEnv).
 */
export class RecordingTransport implements MailTransport {
  sent: Mail[] = [];
  fails = false;

  async send(mail: Mail): Promise<void> {
    if (this.fails) throw new Error("MailerSend 500");
    this.sent.push(mail);
  }

  reset() {
    this.sent.length = 0;
    this.fails = false;
  }
}
